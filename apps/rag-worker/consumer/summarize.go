package consumer

import (
	"context"
	"encoding/json"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"apps/rag-worker/models"
	"apps/rag-worker/summarize"
)

const redisSummarizePausePrefix = "summarize:pause:"

func (p *Processor) setSummarizePause(documentID string, requested bool) {
	if p.redis != nil {
		ctx := context.Background()
		key := redisSummarizePausePrefix + documentID
		if requested {
			_ = p.redis.Set(ctx, key, "1", 0).Err()
		} else {
			_ = p.redis.Del(ctx, key).Err()
		}
	}

	p.summarizePauseMu.Lock()
	if requested {
		p.summarizePauseRequested[documentID] = struct{}{}
	} else {
		delete(p.summarizePauseRequested, documentID)
	}
	p.summarizePauseMu.Unlock()

	if requested {
		p.cancelSummarizeJob(documentID)
	}
}

func (p *Processor) summarizePauseRequestedFor(documentID string) bool {
	if p.redis != nil {
		ctx := context.Background()
		n, err := p.redis.Exists(ctx, redisSummarizePausePrefix+documentID).Result()
		if err == nil && n > 0 {
			return true
		}
	}

	p.summarizePauseMu.Lock()
	defer p.summarizePauseMu.Unlock()
	_, ok := p.summarizePauseRequested[documentID]
	return ok
}

func (p *Processor) registerSummarizeCancel(documentID string, cancel context.CancelFunc) {
	p.summarizeCancelMu.Lock()
	defer p.summarizeCancelMu.Unlock()
	if prev, ok := p.summarizeCancel[documentID]; ok {
		prev()
	}
	p.summarizeCancel[documentID] = cancel
}

func (p *Processor) clearSummarizeCancel(documentID string) {
	p.summarizeCancelMu.Lock()
	defer p.summarizeCancelMu.Unlock()
	delete(p.summarizeCancel, documentID)
}

func (p *Processor) cancelSummarizeJob(documentID string) {
	p.summarizeCancelMu.Lock()
	cancel := p.summarizeCancel[documentID]
	p.summarizeCancelMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (p *Processor) handleSummarize(msg amqp.Delivery) {
	var event models.DocumentSummarizeEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("[Consumer] bad document.summarize payload: %v", err)
		_ = msg.Nack(false, false)
		return
	}
	if event.DocumentID == "" {
		log.Printf("[Consumer] poison document.summarize (missing documentId)")
		_ = msg.Nack(false, false)
		return
	}

	p.setSummarizePause(event.DocumentID, false)
	_ = msg.Ack(false)
	go p.runSummarize(event)
}

func (p *Processor) handleSummarizePause(msg amqp.Delivery) {
	var event models.DocumentSummarizePauseEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("[Consumer] bad document.summarize.pause payload: %v", err)
		_ = msg.Nack(false, false)
		return
	}
	if event.DocumentID == "" {
		log.Printf("[Consumer] poison document.summarize.pause (missing documentId)")
		_ = msg.Nack(false, false)
		return
	}
	p.setSummarizePause(event.DocumentID, true)
	_ = msg.Ack(false)
}

func (p *Processor) runSummarize(event models.DocumentSummarizeEvent) {
	start := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	documentID := event.DocumentID
	p.registerSummarizeCancel(documentID, cancel)
	defer func() {
		p.clearSummarizeCancel(documentID)
		cancel()
	}()

	texts, err := p.store.ListChunkTexts(context.Background(), documentID)
	if err != nil {
		log.Printf("[Summarize] list chunks failed id=%s: %v", documentID, err)
		_ = publishWithRetry("summarize.failed", func() error {
			return p.publisher.PublishSummarizeFailed(documentID, "storage_error")
		})
		return
	}
	if len(texts) == 0 {
		_ = publishWithRetry("summarize.failed", func() error {
			return p.publisher.PublishSummarizeFailed(documentID, "no_chunks")
		})
		return
	}

	paused, err := summarize.Run(
		ctx,
		p.store,
		documentID,
		texts,
		summarize.ContextChars(event.MaxContextChars),
		event.Reset,
		p.allowFallback,
		func() bool {
			return p.summarizePauseRequestedFor(documentID) || p.deletedRequestedFor(documentID)
		},
		func(done, total int) error {
			if p.summarizePauseRequestedFor(documentID) {
				return nil
			}
			return publishWithRetry("summarize.progress", func() error {
				return p.publisher.PublishSummarizeProgress(documentID, done, total)
			})
		},
	)

	if p.deletedRequestedFor(documentID) {
		_ = p.store.DeleteSummarizeCheckpoint(context.Background(), documentID)
		p.setSummarizePause(documentID, false)
		return
	}

	if paused {
		p.setSummarizePause(documentID, false)
		_ = publishWithRetry("summarize.paused", func() error {
			return p.publisher.PublishSummarizePaused(documentID)
		})
		log.Printf("[Summarize] paused id=%s after %s", documentID, time.Since(start))
		return
	}

	if err != nil {
		log.Printf("[Summarize] failed id=%s: %v", documentID, err)
		_ = publishWithRetry("summarize.failed", func() error {
			return p.publisher.PublishSummarizeFailed(documentID, "summarize_error")
		})
		return
	}

	p.setSummarizePause(documentID, false)
	_ = publishWithRetry("summarize.completed", func() error {
		return p.publisher.PublishSummarizeCompleted(documentID)
	})
	log.Printf("[Summarize] completed id=%s in %s", documentID, time.Since(start))
}
