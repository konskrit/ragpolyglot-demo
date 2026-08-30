package consumer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"apps/rag-worker/chunker"
	"apps/rag-worker/embedding"
	"apps/rag-worker/extractor"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
	"apps/rag-worker/workpool"
)

func (p *Processor) handleUploaded(msg amqp.Delivery) {
	var event models.DocumentUploadedEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("[Consumer] bad document.uploaded payload: %v", err)
		_ = msg.Nack(false, false)
		return
	}
	if event.DocumentID == "" {
		log.Printf("[Consumer] poison document.uploaded (missing documentId)")
		_ = msg.Nack(false, false)
		return
	}
	gen := p.nextIngestGen(event.DocumentID)
	go func() {
		p.ingest(msg, event, gen)
	}()
}

func (p *Processor) withFastIngestSlot(fn func()) {
	p.fastIngestSem <- struct{}{}
	defer func() { <-p.fastIngestSem }()
	fn()
}

func (p *Processor) ingest(msg amqp.Delivery, event models.DocumentUploadedEvent, gen uint64) {
	ctx := context.Background()
	start := time.Now()
	acker := newIngestAck(msg)
	p.setPause(event.DocumentID, false)
	log.Printf("[Consumer] processing upload documentId=%s", event.DocumentID)

	if p.ackIfStale(acker, event.DocumentID, gen) {
		return
	}

	stopIngest := func() bool { return p.shouldStopIngest(event.DocumentID, gen) }

	fail := func(reason string, cause error) {
		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}
		p.failIngest(ctx, acker, event.DocumentID, start, reason, cause)
	}
	pause := func() {
		p.ackPaused(acker, event.DocumentID)
	}

	cp, err := p.store.GetCheckpoint(ctx, event.DocumentID)
	if err != nil {
		fail("storage_error", err)
		return
	}
	if event.Retry {
		resumeEmbed := cp != nil && cp.Stage == "embedding"
		if !resumeEmbed {
			if _, err := p.store.DeleteChunks(ctx, event.DocumentID); err != nil {
				fail("storage_error", err)
				return
			}
			if err := p.store.DeleteCheckpoint(ctx, event.DocumentID); err != nil {
				fail("storage_error", err)
				return
			}
			cp = nil
		} else {
			log.Printf("[Consumer] preserving embedding checkpoint documentId=%s embedDone=%d", event.DocumentID, cp.EmbedDone)
		}
	} else if cp == nil {
		n, err := p.store.CountChunks(ctx, event.DocumentID)
		if err != nil {
			fail("storage_error", err)
			return
		}
		if n > 0 {
			if p.ackIfStale(acker, event.DocumentID, gen) {
				return
			}
			p.completeWithoutIngest(ctx, acker, event.DocumentID, int(n), start)
			return
		}
	}

	job := storage.IngestCheckpoint{
		DocumentID:  event.DocumentID,
		OcrLangHint: event.OcrLang,
		FilePath:    event.FilePath,
	}
	embedDone := 0
	chunkingStart := time.Now()

	if cp != nil && cp.Stage == "embedding" {
		job = *cp
		job.Paused = false
		fillCheckpointFromEvent(&job, event)
		embedDone = job.EmbedDone
		embedDone = syncEmbedDoneFromChunks(ctx, p.store, event.DocumentID, embedDone)
		job.EmbedDone = embedDone
		p.publishProgress(event.DocumentID, "embedding", embedDone, 0)
		acker.ack()
		p.withFastIngestSlot(func() {
			p.runEmbedPhase(ctx, acker, event, gen, &job, embedDone, start, chunkingStart)
		})
		return
	}

	if !p.runExtract(ctx, acker, event, gen, &job, cp, stopIngest, fail, pause) {
		return
	}

	p.withFastIngestSlot(func() {
		p.runEmbedPhase(ctx, acker, event, gen, &job, embedDone, start, chunkingStart)
	})
}

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
	// Cap extract concurrency (incl. pdftotext). Hand off to OCR sem when OCR starts
	// so heavy OCR does not keep holding a fast slot.
	p.fastIngestSem <- struct{}{}
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
			return p.acquireOCRIngestSlot()
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

	p.publishProgress(event.DocumentID, "extracting", 0, 0)
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
		return nil
	}

	acker.ack()

	text, langs, extractErr := extractor.ExtractFromPathWithOCR(job.FilePath, job.OcrLangHint, state)
	if extractErr != nil {
		if errors.Is(extractErr, extractor.ErrPaused) {
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

func (p *Processor) runEmbedPhase(
	ctx context.Context,
	acker *ingestAck,
	event models.DocumentUploadedEvent,
	gen uint64,
	job *storage.IngestCheckpoint,
	embedDone int,
	start time.Time,
	chunkingStart time.Time,
) {
	stopIngest := func() bool { return p.shouldStopIngest(event.DocumentID, gen) }

	fail := func(reason string, cause error) {
		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}
		p.failIngest(ctx, acker, event.DocumentID, start, reason, cause)
	}
	pause := func() {
		p.ackPaused(acker, event.DocumentID)
	}

	if p.ackIfStale(acker, event.DocumentID, gen) {
		return
	}

	textChunks := chunker.ChunkText(job.PartialText)
	if len(textChunks) == 0 {
		fail("chunking_error", fmt.Errorf("chunker produced zero chunks"))
		return
	}
	maxChunks := extractor.MaxChunks()
	if len(textChunks) > maxChunks {
		fail("chunking_error", fmt.Errorf("document exceeds %d chunk limit", maxChunks))
		return
	}
	chunkingDuration := time.Since(chunkingStart)

	job.Stage = "embedding"
	job.EmbedDone = embedDone
	job.Paused = false
	if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
		fail("storage_error", err)
		return
	}

	if embedDone == 0 {
		if _, err := p.store.DeleteChunks(ctx, event.DocumentID); err != nil {
			fail("storage_error", err)
			return
		}
	}

	embedStart := time.Now()
	totalChunks := embedDone
	p.publishProgress(event.DocumentID, "embedding", totalChunks, len(textChunks))

	for i := embedDone; i < len(textChunks); i += embedding.BatchSize {
		if stopIngest() {
			if p.ackIfStale(acker, event.DocumentID, gen) {
				return
			}
			job.EmbedDone = totalChunks
			job.Paused = true
			if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
				fail("storage_error", err)
				return
			}
			pause()
			return
		}

		end := min(i+embedding.BatchSize, len(textChunks))
		batch := textChunks[i:end]
		var embedded []models.TextChunk
		err := p.pools.Embed.RunWhile(workpool.EmbedBatchMemory(), stopIngest, func() error {
			if stopIngest() {
				return extractor.ErrPaused
			}
			var err error
			embedded, err = embedding.GenerateAndAttach(batch, p.allowFallback)
			return err
		})
		if errors.Is(err, workpool.ErrStopped) {
			err = extractor.ErrPaused
		}
		if err != nil {
			if errors.Is(err, extractor.ErrPaused) {
				if p.ackIfStale(acker, event.DocumentID, gen) {
					return
				}
				job.EmbedDone = totalChunks
				job.Paused = true
				if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
					fail("storage_error", err)
					return
				}
				pause()
				return
			}
			job.EmbedDone = totalChunks
			job.Stage = "embedding"
			_ = p.store.UpsertCheckpoint(ctx, *job)
			fail("embedding_error", err)
			return
		}

		chunks := make([]models.DocumentChunk, len(embedded))
		for j, tc := range embedded {
			chunks[j] = models.DocumentChunk{
				DocumentID: event.DocumentID,
				ChunkIndex: i + j,
				Content:    tc.Text,
				Embedding:  tc.Embedding,
			}
		}

		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}

		if err := p.store.InsertChunks(ctx, chunks); err != nil {
			job.EmbedDone = totalChunks
			job.Stage = "embedding"
			_ = p.store.UpsertCheckpoint(ctx, *job)
			fail("storage_error", err)
			return
		}
		totalChunks += len(chunks)
		job.EmbedDone = totalChunks
		job.Stage = "embedding"
		if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
			_ = p.store.UpsertCheckpoint(ctx, *job)
			fail("storage_error", err)
			return
		}
		p.publishProgress(event.DocumentID, "embedding", totalChunks, len(textChunks))
	}
	embeddingDuration := time.Since(embedStart)

	if p.ackIfStale(acker, event.DocumentID, gen) {
		return
	}

	if err := p.publisher.PublishProcessed(event.DocumentID, totalChunks, job.OcrLangs); err != nil {
		log.Printf("[Consumer] publish document.processed failed: %v", err)
		acker.nack(true)
		return
	}

	total := time.Since(start)
	p.store.LogSystem(ctx, "document.processed", event.DocumentID, total, map[string]any{
		"chunkCount":          totalChunks,
		"chunkingDurationMs":  chunkingDuration.Milliseconds(),
		"embeddingDurationMs": embeddingDuration.Milliseconds(),
	})

	_ = p.store.DeleteCheckpoint(ctx, event.DocumentID)
	acker.ack()
	log.Printf("[Consumer] document %s processed chunks=%d duration=%s", event.DocumentID, totalChunks, total)
}

func (p *Processor) ackIfStale(acker *ingestAck, documentID string, gen uint64) bool {
	if !p.isIngestStale(documentID, gen) {
		return false
	}
	acker.ack()
	return true
}

func fillCheckpointFromEvent(job *storage.IngestCheckpoint, event models.DocumentUploadedEvent) {
	if job.FilePath == "" {
		job.FilePath = event.FilePath
	}
	if event.Retry {
		job.OcrLangHint = event.OcrLang
		return
	}
	if job.OcrLangHint == "" {
		job.OcrLangHint = event.OcrLang
	}
}

func (p *Processor) completeWithoutIngest(ctx context.Context, acker *ingestAck, documentID string, chunkCount int, start time.Time) {
	log.Printf("[Consumer] document %s already has chunks=%d, skipping ingest", documentID, chunkCount)
	if err := p.publisher.PublishProcessed(documentID, chunkCount, ""); err != nil {
		log.Printf("[Consumer] publish document.processed failed: %v", err)
		acker.nack(true)
		return
	}
	p.store.LogSystem(ctx, "document.processed", documentID, time.Since(start), map[string]any{
		"chunkCount": chunkCount,
		"duplicate":  true,
	})
	acker.ack()
}

func syncEmbedDoneFromChunks(ctx context.Context, store *storage.Store, documentID string, embedDone int) int {
	if store == nil {
		return embedDone
	}
	n, err := store.CountChunks(ctx, documentID)
	if err != nil || int(n) <= embedDone {
		return embedDone
	}
	return int(n)
}

func isResumableFailure(reason string) bool {
	return reason == "embedding_error" || reason == "storage_error"
}

func (p *Processor) failIngest(ctx context.Context, acker *ingestAck, documentID string, start time.Time, reason string, cause error) {
	log.Printf("[Consumer] document %s failed (%s): %v", documentID, reason, cause)
	if isResumableFailure(reason) {
		log.Printf("[Consumer] preserving ingest progress documentId=%s reason=%s", documentID, reason)
	} else {
		_, _ = p.store.DeleteChunks(ctx, documentID)
		_ = p.store.DeleteCheckpoint(ctx, documentID)
	}
	if pubErr := p.publisher.PublishFailed(documentID, reason); pubErr != nil {
		log.Printf("[Consumer] publish document.failed failed: %v", pubErr)
		acker.nack(true)
		return
	}
	p.store.LogSystem(ctx, reason, documentID, time.Since(start), map[string]any{
		"error": cause.Error(),
	})
	acker.ack()
}

func (p *Processor) ackPaused(acker *ingestAck, documentID string) {
	log.Printf("[Consumer] document %s paused", documentID)
	if pubErr := p.publisher.PublishPaused(documentID); pubErr != nil {
		log.Printf("[Consumer] publish document.paused failed: %v", pubErr)
		acker.nack(true)
		return
	}
	p.setPause(documentID, false)
	acker.ack()
}

func (p *Processor) publishProgress(documentID, stage string, done, total int) {
	if err := p.publisher.PublishProgress(documentID, stage, done, total); err != nil {
		log.Printf("[Consumer] progress publish failed documentId=%s: %v", documentID, err)
	}
}
