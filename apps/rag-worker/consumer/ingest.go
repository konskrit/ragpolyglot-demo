package consumer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"apps/rag-worker/chunker"
	"apps/rag-worker/embedding"
	"apps/rag-worker/extractor"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
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
	p.ingest(msg, event)
}

func (p *Processor) ingest(msg amqp.Delivery, event models.DocumentUploadedEvent) {
	ctx := context.Background()
	start := time.Now()
	p.setPause(event.DocumentID, false)
	log.Printf("[Consumer] processing upload documentId=%s", event.DocumentID)

	fail := func(reason string, cause error) {
		p.failIngest(ctx, msg, event.DocumentID, start, reason, cause)
	}
	pause := func() {
		p.ackPaused(msg, event.DocumentID)
	}

	cp, err := p.store.GetCheckpoint(ctx, event.DocumentID)
	if err != nil {
		fail("storage_error", err)
		return
	}
	if event.Retry {
		if _, err := p.store.DeleteChunks(ctx, event.DocumentID); err != nil {
			fail("storage_error", err)
			return
		}
		if err := p.store.DeleteCheckpoint(ctx, event.DocumentID); err != nil {
			fail("storage_error", err)
			return
		}
		cp = nil
	} else if cp == nil {
		n, err := p.store.CountChunks(ctx, event.DocumentID)
		if err != nil {
			fail("storage_error", err)
			return
		}
		if n > 0 {
			p.completeWithoutIngest(ctx, msg, event.DocumentID, int(n), start)
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
		p.publishProgress(event.DocumentID, "embedding", embedDone, 0)
	} else {
		state := extractor.OCRState{
			ShouldPause: func() bool { return p.pauseRequestedFor(event.DocumentID) },
		}
		if cp != nil && cp.Stage == "ocr" {
			job = *cp
			job.Paused = false
			fillCheckpointFromEvent(&job, event)
			state.StartPage = job.OcrPageDone + 1
			state.PriorText = job.PartialText
			state.Resolved = job.OcrLangs
		} else {
			job.Stage = "ocr"
			if err := p.store.UpsertCheckpoint(ctx, job); err != nil {
				fail("storage_error", err)
				return
			}
		}

		p.publishProgress(event.DocumentID, "extracting", 0, 0)
		state.OnProgress = func(done, total int, textSoFar, langs string) error {
			job.Stage = "ocr"
			job.OcrPageDone = done
			job.OcrTotal = total
			job.OcrLangs = langs
			job.PartialText = textSoFar
			job.Paused = false
			if err := p.store.UpsertCheckpoint(ctx, job); err != nil {
				return err
			}
			p.publishProgress(event.DocumentID, "extracting", done, total)
			return nil
		}

		text, langs, extractErr := extractor.ExtractFromPathWithOCR(job.FilePath, job.OcrLangHint, state)
		if extractErr != nil {
			if errors.Is(extractErr, extractor.ErrPaused) {
				job.PartialText = text
				job.Paused = true
				if langs != "" {
					job.OcrLangs = langs
				}
				if err := p.store.UpsertCheckpoint(ctx, job); err != nil {
					fail("storage_error", err)
					return
				}
				pause()
				return
			}
			if errors.Is(extractErr, extractor.ErrOcrLanguageNeeded) {
				fail(extractor.ErrOcrLanguageNeeded.Error(), extractErr)
				return
			}
			fail("chunking_error", extractErr)
			return
		}
		job.PartialText = text
		if langs != "" {
			job.OcrLangs = langs
		}
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

	if embedDone == 0 {
		if _, err := p.store.DeleteChunks(ctx, event.DocumentID); err != nil {
			fail("storage_error", err)
			return
		}
	}

	job.Stage = "embedding"
	job.EmbedDone = embedDone
	job.Paused = false
	if err := p.store.UpsertCheckpoint(ctx, job); err != nil {
		fail("storage_error", err)
		return
	}

	embedStart := time.Now()
	totalChunks := embedDone
	p.publishProgress(event.DocumentID, "embedding", totalChunks, len(textChunks))

	for i := embedDone; i < len(textChunks); i += embedding.BatchSize {
		if p.pauseRequestedFor(event.DocumentID) {
			job.EmbedDone = totalChunks
			job.Paused = true
			if err := p.store.UpsertCheckpoint(ctx, job); err != nil {
				fail("storage_error", err)
				return
			}
			pause()
			return
		}

		end := min(i+embedding.BatchSize, len(textChunks))
		embedded, err := embedding.GenerateAndAttach(textChunks[i:end], p.allowFallback)
		if err != nil {
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

		if err := p.store.InsertChunks(ctx, chunks); err != nil {
			fail("storage_error", err)
			return
		}
		totalChunks += len(chunks)
		job.EmbedDone = totalChunks
		if err := p.store.UpsertCheckpoint(ctx, job); err != nil {
			fail("storage_error", err)
			return
		}
		p.publishProgress(event.DocumentID, "embedding", totalChunks, len(textChunks))
	}
	embeddingDuration := time.Since(embedStart)

	if p.redis != nil {
		_ = p.redis.Set(ctx, "doc:"+event.DocumentID+":chunks", totalChunks, 24*time.Hour).Err()
	}

	if err := p.publisher.PublishProcessed(event.DocumentID, totalChunks, job.OcrLangs); err != nil {
		log.Printf("[Consumer] publish document.processed failed: %v", err)
		_ = msg.Nack(false, true)
		return
	}

	total := time.Since(start)
	p.store.LogSystem(ctx, "document.processed", event.DocumentID, total, map[string]any{
		"chunkCount":          totalChunks,
		"chunkingDurationMs":  chunkingDuration.Milliseconds(),
		"embeddingDurationMs": embeddingDuration.Milliseconds(),
	})

	_ = p.store.DeleteCheckpoint(ctx, event.DocumentID)
	_ = msg.Ack(false)
	log.Printf("[Consumer] document %s processed chunks=%d duration=%s", event.DocumentID, totalChunks, total)
}

func fillCheckpointFromEvent(job *storage.IngestCheckpoint, event models.DocumentUploadedEvent) {
	if job.FilePath == "" {
		job.FilePath = event.FilePath
	}
	if job.OcrLangHint == "" {
		job.OcrLangHint = event.OcrLang
	}
}

func (p *Processor) completeWithoutIngest(ctx context.Context, msg amqp.Delivery, documentID string, chunkCount int, start time.Time) {
	log.Printf("[Consumer] document %s already has chunks=%d, skipping ingest", documentID, chunkCount)
	if err := p.publisher.PublishProcessed(documentID, chunkCount, ""); err != nil {
		log.Printf("[Consumer] publish document.processed failed: %v", err)
		_ = msg.Nack(false, true)
		return
	}
	p.store.LogSystem(ctx, "document.processed", documentID, time.Since(start), map[string]any{
		"chunkCount": chunkCount,
		"duplicate":  true,
	})
	_ = msg.Ack(false)
}

func (p *Processor) failIngest(ctx context.Context, msg amqp.Delivery, documentID string, start time.Time, reason string, cause error) {
	log.Printf("[Consumer] document %s failed (%s): %v", documentID, reason, cause)
	_, _ = p.store.DeleteChunks(ctx, documentID)
	_ = p.store.DeleteCheckpoint(ctx, documentID)
	if pubErr := p.publisher.PublishFailed(documentID, reason); pubErr != nil {
		log.Printf("[Consumer] publish document.failed failed: %v", pubErr)
		_ = msg.Nack(false, true)
		return
	}
	p.store.LogSystem(ctx, reason, documentID, time.Since(start), map[string]any{
		"error": cause.Error(),
	})
	_ = msg.Ack(false)
}

func (p *Processor) ackPaused(msg amqp.Delivery, documentID string) {
	log.Printf("[Consumer] document %s paused", documentID)
	if pubErr := p.publisher.PublishPaused(documentID); pubErr != nil {
		log.Printf("[Consumer] publish document.paused failed: %v", pubErr)
		_ = msg.Nack(false, true)
		return
	}
	p.setPause(documentID, false)
	_ = msg.Ack(false)
}

func (p *Processor) publishProgress(documentID, stage string, done, total int) {
	if err := p.publisher.PublishProgress(documentID, stage, done, total); err != nil {
		log.Printf("[Consumer] progress publish failed documentId=%s: %v", documentID, err)
	}
}
