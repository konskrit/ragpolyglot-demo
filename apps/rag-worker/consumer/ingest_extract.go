package consumer

import (
	"context"
	"errors"
	"sync"

	"apps/rag-worker/extractor"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
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

	state := extractor.OCRState{
		ShouldPause: stopIngest,
		Pool:        p.pools.OCR,
		PageWorkers: p.ocrWorkerCount,
		OnOCRStart: func() func() {
			releaseFast()
			waiting := func() {
				p.publishProgress(event.DocumentID, "waiting_for_ocr", job.OcrPageDone, job.OcrTotal)
			}
			release, err := p.acquireOCRIngestSlot(stopIngest, waiting)
			if err != nil {
				return nil
			}
			if job.OcrTotal > 0 {
				p.publishProgress(event.DocumentID, "extracting", job.OcrPageDone, job.OcrTotal)
			}
			return release
		},
	}
	if cp != nil && cp.Stage == "ocr" {
		*job = *cp
		job.Paused = false
		fillCheckpointFromEvent(job, event)
		state.StartPage = job.OcrPageDone + 1
		state.PriorText = job.PartialText
		state.Resolved = job.OcrLangs
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

	acker.ack()

	text, langs, extractErr := extractor.ExtractFromPathWithOCR(job.FilePath, job.OcrLangHint, state)
	if extractErr != nil {
		if errors.Is(extractErr, extractor.ErrPaused) || extractor.IsProcessAbort(extractErr) {
			if p.ackIfStale(acker, event.DocumentID, gen) {
				return false
			}
			job.PartialText = text
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
		fail("chunking_error", extractErr)
		return false
	}
	job.PartialText = text
	if langs != "" {
		job.OcrLangs = langs
	}
	return true
}
