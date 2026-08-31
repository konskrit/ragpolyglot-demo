package consumer

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"apps/rag-worker/chunker"
	"apps/rag-worker/embedding"
	"apps/rag-worker/extractor"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
	"apps/rag-worker/workpool"
)

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
		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}
		totalChunks += len(chunks)
		job.EmbedDone = totalChunks
		job.Stage = "embedding"
		if err := p.store.UpsertCheckpoint(ctx, *job); err != nil {
			fail("storage_error", err)
			return
		}
		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}
		p.publishProgress(event.DocumentID, "embedding", totalChunks, len(textChunks))
	}
	embeddingDuration := time.Since(embedStart)

	if p.ackIfStale(acker, event.DocumentID, gen) {
		return
	}

	// Drop checkpoint before publish so a requeued/redelivered message can
	// complete via existing chunks instead of resuming a stale checkpoint.
	if err := deleteCheckpointWithRetry(ctx, p.store, event.DocumentID); err != nil {
		log.Printf("[Consumer] CRITICAL: delete checkpoint before processed failed documentId=%s: %v", event.DocumentID, err)
		if !acker.settled() {
			time.Sleep(requeueBackoff)
			acker.nack(true)
			return
		}
		scheduleAsyncRetry("checkpoint-delete", event.DocumentID, func() error {
			return p.store.DeleteCheckpoint(context.Background(), event.DocumentID)
		})
	}

	if p.ackIfStale(acker, event.DocumentID, gen) {
		return
	}

	if err := publishWithRetry("document.processed", func() error {
		return p.publisher.PublishProcessed(event.DocumentID, totalChunks, job.OcrLangs)
	}); err != nil {
		log.Printf("[Consumer] CRITICAL: document.processed publish failed documentId=%s: %v", event.DocumentID, err)
		if !acker.settled() {
			acker.nack(true)
		}
		return
	}

	total := time.Since(start)
	p.store.LogSystem(ctx, "document.processed", event.DocumentID, total, map[string]any{
		"chunkCount":          totalChunks,
		"chunkingDurationMs":  chunkingDuration.Milliseconds(),
		"embeddingDurationMs": embeddingDuration.Milliseconds(),
	})

	acker.ack()
	log.Printf("[Consumer] document %s processed chunks=%d duration=%s", event.DocumentID, totalChunks, total)
}
