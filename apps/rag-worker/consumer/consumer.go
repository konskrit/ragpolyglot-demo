package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"

	"apps/rag-worker/chunker"
	"apps/rag-worker/embedding"
	"apps/rag-worker/extractor"
	"apps/rag-worker/models"
	"apps/rag-worker/publisher"
	rmq "apps/rag-worker/rabbitmq"
	"apps/rag-worker/storage"
)

type Processor struct {
	store         *storage.Store
	publisher     *publisher.Publisher
	redis         *redis.Client
	allowFallback bool
}

func NewProcessor(store *storage.Store, pub *publisher.Publisher, redisClient *redis.Client, allowFallback bool) *Processor {
	return &Processor{
		store:         store,
		publisher:     pub,
		redis:         redisClient,
		allowFallback: allowFallback,
	}
}

func Start(rabbitURL string, proc *Processor) {
	go reconnectLoop(rabbitURL, rmq.UploadedQueue, proc.handleUploaded)
	go reconnectLoop(rabbitURL, rmq.DeletedQueue, proc.handleDeleted)
	log.Printf("[Consumer] listening on %s and %s (with reconnect)", rmq.UploadedQueue, rmq.DeletedQueue)
}

func reconnectLoop(rabbitURL, queueName string, handler func(amqp.Delivery)) {
	for {
		conn := rmq.Connect(rabbitURL)

		ch, err := conn.Channel()
		if err != nil {
			_ = conn.Close()
			log.Printf("[Consumer] channel failed (%s): %v", queueName, err)
			time.Sleep(2 * time.Second)
			continue
		}

		if err := rmq.SetupTopology(ch); err != nil {
			_ = ch.Close()
			_ = conn.Close()
			log.Printf("[Consumer] topology failed (%s): %v", queueName, err)
			time.Sleep(2 * time.Second)
			continue
		}

		msgs, err := rmq.Consume(ch, queueName)
		if err != nil {
			_ = ch.Close()
			_ = conn.Close()
			log.Printf("[Consumer] consume failed (%s): %v", queueName, err)
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("[Consumer] connected queue=%s", queueName)
		for msg := range msgs {
			handler(msg)
		}

		_ = ch.Close()
		_ = conn.Close()
		log.Printf("[Consumer] disconnected queue=%s; reconnecting", queueName)
		time.Sleep(2 * time.Second)
	}
}

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

	ctx := context.Background()
	start := time.Now()
	log.Printf("[Consumer] processing upload documentId=%s", event.DocumentID)

	fail := func(reason string, cause error) {
		log.Printf("[Consumer] document %s failed (%s): %v", event.DocumentID, reason, cause)
		if pubErr := p.publisher.PublishFailed(event.DocumentID, reason); pubErr != nil {
			log.Printf("[Consumer] publish document.failed failed: %v", pubErr)
			_ = msg.Nack(false, true)
			return
		}
		p.store.LogSystem(ctx, reason, event.DocumentID, time.Since(start), map[string]any{
			"error": cause.Error(),
		})
		_ = msg.Ack(false)
	}

	chunkingStart := time.Now()
	content, err := extractor.ReadFile(event.FilePath)
	if err != nil {
		fail("chunking_error", err)
		return
	}

	text := extractor.ExtractText(content, event.FilePath)
	if text == "" {
		fail("chunking_error", fmt.Errorf("no text extracted"))
		return
	}

	textChunks := chunker.ChunkText(text)
	if len(textChunks) == 0 {
		fail("chunking_error", fmt.Errorf("chunker produced zero chunks"))
		return
	}
	chunkingDuration := time.Since(chunkingStart)

	embedStart := time.Now()
	embedded, err := embedding.GenerateAndAttach(textChunks, p.allowFallback)
	if err != nil {
		fail("embedding_error", err)
		return
	}
	embeddingDuration := time.Since(embedStart)

	chunks := make([]models.DocumentChunk, 0, len(embedded))
	for i, tc := range embedded {
		chunks = append(chunks, models.DocumentChunk{
			DocumentID: event.DocumentID,
			ChunkIndex: i,
			Content:    tc.Text,
			Embedding:  tc.Embedding,
		})
	}

	storeStart := time.Now()
	if err := p.store.StoreChunks(ctx, event.DocumentID, chunks); err != nil {
		fail("storage_error", err)
		return
	}
	storageDuration := time.Since(storeStart)

	if p.redis != nil {
		_ = p.redis.Set(ctx, "doc:"+event.DocumentID+":chunks", len(chunks), 24*time.Hour).Err()
	}

	if err := p.publisher.PublishProcessed(event.DocumentID, len(chunks)); err != nil {
		log.Printf("[Consumer] publish document.processed failed: %v", err)
		_ = msg.Nack(false, true)
		return
	}

	total := time.Since(start)
	p.store.LogSystem(ctx, "document.processed", event.DocumentID, total, map[string]any{
		"chunkCount":          len(chunks),
		"chunkingDurationMs":  chunkingDuration.Milliseconds(),
		"embeddingDurationMs": embeddingDuration.Milliseconds(),
		"storageDurationMs":   storageDuration.Milliseconds(),
	})

	_ = msg.Ack(false)
	log.Printf("[Consumer] document %s processed chunks=%d duration=%s", event.DocumentID, len(chunks), total)
}

func (p *Processor) handleDeleted(msg amqp.Delivery) {
	var event models.DocumentDeletedEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("[Consumer] bad document.deleted payload: %v", err)
		_ = msg.Nack(false, false)
		return
	}
	if event.DocumentID == "" {
		log.Printf("[Consumer] poison document.deleted (missing documentId)")
		_ = msg.Nack(false, false)
		return
	}

	ctx := context.Background()
	start := time.Now()

	deleted, err := p.store.DeleteChunks(ctx, event.DocumentID)
	if err != nil {
		log.Printf("[Consumer] delete chunks failed for %s: %v", event.DocumentID, err)
		_ = msg.Nack(false, true)
		return
	}

	if p.redis != nil {
		_ = p.redis.Del(ctx, "doc:"+event.DocumentID+":chunks").Err()
	}

	p.store.LogSystem(ctx, "document.deleted", event.DocumentID, time.Since(start), map[string]any{
		"deletedChunks": deleted,
	})

	_ = msg.Ack(false)
	log.Printf("[Consumer] document %s chunks deleted count=%d", event.DocumentID, deleted)
}
