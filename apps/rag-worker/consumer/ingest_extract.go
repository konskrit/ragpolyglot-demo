package consumer

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"apps/rag-worker/extractor"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
)

const (
	ocrAbortRetries = 3
	ocrAbortBackoff = 500 * time.Millisecond
)

func (p *Processor) runExtract(
	ctx context.Context,
	acker *ingestAck,
	event models.DocumentUploadedEvent,
	gen uint64,
	job *storage.IngestCheckpoint,
	cp *storage.IngestCheckpoint,
	stopIngest func() bool,
	fail func(string, error),
	pause func(),
) bool {
	// Release the fast slot when OCR starts so Kraken does not block pdftotext.
	if err := waitChanSlot(p.fastIngestSem, stopIngest); err != nil {
		pause()
		return false
	}
	var releaseFastOnce sync.Once
	releaseFast := func() {
		releaseFastOnce.Do(func() { <-p.fastIngestSem })
	}
	defer releaseFast()

	// OCR capacity is taken once and held across abort retries. Ack happens with
	// that first acquire so retries never wait in-process after the message is settled.
	var (
		ocrRelease   func()
		ocrStartErr  error
		ocrStartOnce sync.Once
	)
	defer func() {
		if ocrRelease != nil {
			ocrRelease()
		}
	}()

	state := extractor.OCRState{
		ShouldPause: stopIngest,
		Pool:        p.pools.OCR,
		PageWorkers: p.ocrWorkerCount,
		OnOCRStart: func() (func(), error) {
			releaseFast()
			ocrStartOnce.Do(func() {
				ocrRelease, ocrStartErr = p.acquireOCRIngestSlot(stopIngest, func() {
					p.publishProgress(event.DocumentID, "waiting_for_ocr", job.OcrPageDone, job.OcrTotal)
				})
				if ocrStartErr != nil {
					return
				}
				acker.ack()
				p.publishProgress(event.DocumentID, "extracting", job.OcrPageDone, job.OcrTotal)
			})
			if ocrStartErr != nil {
				return nil, ocrStartErr
			}
			// Extractor defers this; real release is in runExtract's defer.
			return func() {}, nil
		},
	}
	if cp != nil && cp.Stage == "ocr" {
		*job = *cp
		job.Paused = false
		fillCheckpointFromEvent(job, event)
	} else {
		job.Stage = "ocr"
		if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
			fail("storage_error", err)
			return false
		}
	}

	state.OnProgress = func(done, total int, textSoFar, langs string) error {
		if p.isIngestStale(event.DocumentID, gen) {
			return extractor.ErrPaused
		}
		job.Stage = "ocr"
		job.OcrPageDone = done
		job.OcrTotal = total
		job.OcrLangs = langs
		job.PartialText = textSoFar
		job.Paused = false
		if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
			return err
		}
		p.publishProgress(event.DocumentID, "extracting", done, total)
		if stopIngest() {
			return extractor.ErrPaused
		}
		return nil
	}

	streak := 0
	lastDone := job.OcrPageDone
	for {
		if stopIngest() {
			pause()
			return false
		}
		state.StartPage = job.OcrPageDone + 1
		state.PriorText = job.PartialText
		state.Resolved = job.OcrLangs

		text, langs, extractErr := extractor.ExtractFromPathWithOCR(job.FilePath, job.OcrLangHint, state)
		if extractErr == nil {
			job.PartialText = text
			if langs != "" {
				job.OcrLangs = langs
			}
			if !acker.settled() {
				acker.ack()
			}
			return true
		}
		if errors.Is(extractErr, extractor.ErrPaused) {
			if p.ackIfStale(acker, event.DocumentID, gen) {
				return false
			}
			if text != "" {
				job.PartialText = text
			}
			job.Paused = true
			if langs != "" {
				job.OcrLangs = langs
			}
			if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
				fail("storage_error", err)
				return false
			}
			pause()
			return false
		}
		if errors.Is(extractErr, extractor.ErrOcrLanguageNeeded) {
			fail(extractor.ErrOcrLanguageNeeded.Error(), extractErr)
			return false
		}
		if text != "" {
			job.PartialText = text
		}
		if langs != "" {
			job.OcrLangs = langs
		}
		if !extractor.IsTransientOCRAbort(extractErr) {
			fail("chunking_error", extractErr)
			return false
		}

		if job.OcrPageDone > lastDone {
			streak = 0
			lastDone = job.OcrPageDone
		}
		streak++
		if streak >= ocrAbortRetries {
			fail("ocr_aborted", extractErr)
			return false
		}
		log.Printf(
			"[Consumer] OCR abort documentId=%s streak=%d/%d: %v; retrying from page %d",
			event.DocumentID, streak, ocrAbortRetries, extractErr, job.OcrPageDone+1,
		)
		if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
			fail("storage_error", err)
			return false
		}
		time.Sleep(time.Duration(streak) * ocrAbortBackoff)
	}
}
