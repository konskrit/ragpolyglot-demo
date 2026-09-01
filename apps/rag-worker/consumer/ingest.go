package consumer

import (
	"context"
	"encoding/json"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

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
	p.setDeleted(event.DocumentID, false)
	p.setPause(event.DocumentID, false)
	gen := p.nextIngestGen(event.DocumentID)
	go func() {
		p.ingest(msg, event, gen)
	}()
}

func (p *Processor) withFastIngestSlot(stop func() bool, fn func()) error {
	if err := waitChanSlot(p.fastIngestSem, stop); err != nil {
		return err
	}
	defer func() { <-p.fastIngestSem }()
	fn()
	return nil
}

func (p *Processor) ingest(msg amqp.Delivery, event models.DocumentUploadedEvent, gen uint64) {
	ctx := context.Background()
	start := time.Now()
	acker := newIngestAck(msg)
	log.Printf("[Consumer] processing upload documentId=%s", event.DocumentID)

	if p.ackIfStale(acker, event.DocumentID, gen) {
		return
	}

	stopIngest := func() bool { return p.shouldStopIngest(event.DocumentID, gen) }
	pause := func() {
		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}
		p.ackPaused(acker, event.DocumentID)
	}
	if stopIngest() {
		pause()
		return
	}

	fail := func(reason string, cause error) {
		if p.ackIfStale(acker, event.DocumentID, gen) {
			return
		}
		if stopIngest() {
			pause()
			return
		}
		p.failIngest(ctx, acker, event.DocumentID, start, reason, cause)
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
		if err := p.withFastIngestSlot(stopIngest, func() {
			p.runEmbedPhase(ctx, acker, event, gen, &job, embedDone, start, chunkingStart)
		}); err != nil {
			pause()
		}
		return
	}

	if !p.runExtract(ctx, acker, event, gen, &job, cp, stopIngest, fail, pause) {
		return
	}

	if err := p.withFastIngestSlot(stopIngest, func() {
		p.runEmbedPhase(ctx, acker, event, gen, &job, embedDone, start, chunkingStart)
	}); err != nil {
		pause()
	}
}

func (p *Processor) ackIfStale(acker *ingestAck, documentID string, gen uint64) bool {
	deleted := p.deletedRequestedFor(documentID)
	if !deleted && !p.isIngestStale(documentID, gen) {
		return false
	}
	if deleted && p.store != nil {
		ctx := context.Background()
		if err := wipeIngestDataWithRetry(ctx, p.store, documentID); err != nil {
			log.Printf("[Consumer] wipe on deleted failed documentId=%s: %v", documentID, err)
			if !acker.settled() {
				time.Sleep(requeueBackoff)
				acker.nack(true)
				return true
			}
			log.Printf("[Consumer] CRITICAL: wipe on deleted failed after early ack documentId=%s; scheduling async retry", documentID)
			scheduleAsyncRetry("wipe", documentID, func() error {
				return wipeIngestData(context.Background(), p.store, documentID)
			})
			return true
		}
	}
	acker.ack()
	return true
}

func wipeIngestData(ctx context.Context, store *storage.Store, documentID string) error {
	if store == nil {
		return nil
	}
	if _, err := store.DeleteChunks(ctx, documentID); err != nil {
		return err
	}
	return store.DeleteCheckpoint(ctx, documentID)
}

func retryOp(attempts int, fn func() error) error {
	var last error
	for attempt := 1; attempt <= attempts; attempt++ {
		last = fn()
		if last == nil {
			return nil
		}
		if attempt < attempts {
			time.Sleep(requeueBackoff)
		}
	}
	return last
}

func wipeIngestDataWithRetry(ctx context.Context, store *storage.Store, documentID string) error {
	return retryOp(3, func() error {
		return wipeIngestData(ctx, store, documentID)
	})
}

func deleteCheckpointWithRetry(ctx context.Context, store *storage.Store, documentID string) error {
	return retryOp(3, func() error {
		if store == nil {
			return nil
		}
		return store.DeleteCheckpoint(ctx, documentID)
	})
}

const asyncRetryAttempts = 10

func scheduleAsyncRetry(label, documentID string, fn func() error) {
	go func() {
		for attempt := 1; attempt <= asyncRetryAttempts; attempt++ {
			time.Sleep(requeueBackoff * time.Duration(attempt))
			if err := fn(); err == nil {
				log.Printf("[Consumer] async %s ok documentId=%s attempt=%d", label, documentID, attempt)
				return
			} else {
				log.Printf("[Consumer] async %s attempt %d/%d documentId=%s: %v", label, attempt, asyncRetryAttempts, documentID, err)
			}
		}
		log.Printf("[Consumer] CRITICAL: async %s exhausted documentId=%s", label, documentID)
	}()
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
	if err := publishWithRetry("document.processed", func() error {
		return p.publisher.PublishProcessed(documentID, chunkCount, "")
	}); err != nil {
		log.Printf("[Consumer] CRITICAL: document.processed publish failed documentId=%s: %v", documentID, err)
		if !acker.settled() {
			acker.nack(true)
		}
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
	} else if err := wipeIngestDataWithRetry(ctx, p.store, documentID); err != nil {
		log.Printf("[Consumer] CRITICAL: wipe after %s failed documentId=%s: %v", reason, documentID, err)
		if !acker.settled() {
			time.Sleep(requeueBackoff)
			acker.nack(true)
			return
		}
		scheduleAsyncRetry("wipe", documentID, func() error {
			return wipeIngestData(context.Background(), p.store, documentID)
		})
	}

	if pubErr := publishWithRetry("document.failed", func() error {
		return p.publisher.PublishFailed(documentID, reason)
	}); pubErr != nil {
		log.Printf("[Consumer] CRITICAL: document.failed publish failed documentId=%s: %v", documentID, pubErr)
		if !acker.settled() {
			acker.nack(true)
		}
		return
	}
	p.store.LogSystem(ctx, reason, documentID, time.Since(start), map[string]any{
		"error": cause.Error(),
	})
	acker.ack()
}

func (p *Processor) ackPaused(acker *ingestAck, documentID string) {
	log.Printf("[Consumer] document %s paused", documentID)
	if pubErr := publishWithRetry("document.paused", func() error {
		return p.publisher.PublishPaused(documentID)
	}); pubErr != nil {
		log.Printf("[Consumer] CRITICAL: document.paused publish failed documentId=%s: %v", documentID, pubErr)
		if !acker.settled() {
			acker.nack(true)
		}
		return
	}
	p.setPause(documentID, false)
	acker.ack()
}

func (p *Processor) publishProgress(documentID, stage string, done, total int) {
	if p.pauseRequestedFor(documentID) {
		return
	}
	if err := p.publisher.PublishProgress(documentID, stage, done, total); err != nil {
		log.Printf("[Consumer] progress publish failed documentId=%s: %v", documentID, err)
	}
}
