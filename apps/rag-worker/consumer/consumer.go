package consumer

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"

	"apps/rag-worker/models"
	"apps/rag-worker/publisher"
	rmq "apps/rag-worker/rabbitmq"
	"apps/rag-worker/storage"
	"apps/rag-worker/workpool"
)

type Processor struct {
	store            *storage.Store
	publisher        *publisher.Publisher
	redis            *redis.Client
	allowFallback    bool
	pools            *workpool.Pools
	pauseMu          sync.Mutex
	pauseRequested   map[string]struct{}
	deletedMu        sync.Mutex
	deletedRequested map[string]struct{}
	ingestGenMu      sync.Mutex
	ingestGen        map[string]uint64
	ocrIngestActive  atomic.Int32
	fastIngestSem    chan struct{}
	ocrIngestSem     chan struct{}
}

func NewProcessor(store *storage.Store, pub *publisher.Publisher, redisClient *redis.Client, allowFallback bool, pools *workpool.Pools) *Processor {
	return &Processor{
		store:            store,
		publisher:        pub,
		redis:            redisClient,
		allowFallback:    allowFallback,
		pools:            pools,
		pauseRequested:   make(map[string]struct{}),
		deletedRequested: make(map[string]struct{}),
		ingestGen:        make(map[string]uint64),
		fastIngestSem:    make(chan struct{}, workpool.FastIngestPrefetch()),
		ocrIngestSem:     make(chan struct{}, workpool.OCRIngestPrefetch()),
	}
}

func Start(rabbitURL string, proc *Processor) {
	prefetch := workpool.RabbitPrefetch()
	go reconnectLoop(rabbitURL, rmq.UploadedQueue, prefetch, proc.handleUploaded)
	go reconnectLoop(rabbitURL, rmq.DeletedQueue, 0, proc.handleDeleted)
	go reconnectLoop(rabbitURL, rmq.PauseQueue, 0, proc.handlePause)
	log.Printf("[Consumer] prefetch=%d for %s", prefetch, rmq.UploadedQueue)
	log.Printf("[Consumer] listening on %s, %s, and %s (with reconnect)", rmq.UploadedQueue, rmq.DeletedQueue, rmq.PauseQueue)
}

func reconnectLoop(rabbitURL, queueName string, prefetch int, handler func(amqp.Delivery)) {
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

		msgs, err := rmq.Consume(ch, queueName, prefetch)
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

func (p *Processor) handlePause(msg amqp.Delivery) {
	var event models.DocumentPauseEvent
	if err := json.Unmarshal(msg.Body, &event); err != nil {
		log.Printf("[Consumer] bad document.pause payload: %v", err)
		_ = msg.Nack(false, false)
		return
	}
	if event.DocumentID == "" {
		log.Printf("[Consumer] poison document.pause (missing documentId)")
		_ = msg.Nack(false, false)
		return
	}

	p.setPause(event.DocumentID, true)
	log.Printf("[Consumer] pause requested documentId=%s", event.DocumentID)
	_ = msg.Ack(false)
}

func (p *Processor) ocrWorkerCount(pages int) int {
	slots := p.pools.OCR.Slots()
	active := int(p.ocrIngestActive.Load())
	if active < 1 {
		active = 1
	}
	workers := slots / active
	if workers < 1 {
		workers = 1
	}
	if pages > 0 && workers > pages {
		workers = pages
	}
	return workers
}

func (p *Processor) acquireOCRIngestSlot() func() {
	p.ocrIngestSem <- struct{}{}
	p.ocrIngestActive.Add(1)
	return func() {
		p.ocrIngestActive.Add(-1)
		<-p.ocrIngestSem
	}
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
	p.setPause(event.DocumentID, false)
	p.setDeleted(event.DocumentID, true)
	p.nextIngestGen(event.DocumentID)

	deleted, err := p.store.DeleteChunks(ctx, event.DocumentID)
	if err != nil {
		log.Printf("[Consumer] delete chunks failed for %s: %v", event.DocumentID, err)
		_ = msg.Nack(false, true)
		return
	}
	_ = p.store.DeleteCheckpoint(ctx, event.DocumentID)

	p.store.LogSystem(ctx, "document.deleted", event.DocumentID, time.Since(start), map[string]any{
		"deletedChunks": deleted,
	})

	_ = msg.Ack(false)
	log.Printf("[Consumer] document %s chunks deleted count=%d", event.DocumentID, deleted)
}
