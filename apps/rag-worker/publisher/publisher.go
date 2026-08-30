package publisher

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"apps/rag-worker/models"
	rmq "apps/rag-worker/rabbitmq"
)

type Publisher struct {
	url  string
	mu   sync.Mutex
	conn *amqp.Connection
	ch   *amqp.Channel
}

func New(url string) *Publisher {
	return &Publisher{url: url}
}

func (p *Publisher) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.closeLocked()
}

func (p *Publisher) WarmUp() {
	p.mu.Lock()
	defer p.mu.Unlock()
	_ = p.ensureChannelLocked()
}

func (p *Publisher) Connected() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.conn != nil && !p.conn.IsClosed() && p.ch != nil && !p.ch.IsClosed()
}

func (p *Publisher) PublishProcessed(documentID string, chunkCount int, ocrLang string) error {
	event := models.DocumentProcessedEvent{
		Type:       rmq.RoutingProcessed,
		DocumentID: documentID,
		ChunkCount: chunkCount,
		OcrLang:    ocrLang,
		Timestamp:  time.Now().UTC(),
	}
	return p.publish(rmq.RoutingProcessed, event)
}

func (p *Publisher) PublishProgress(documentID, stage string, done, total int) error {
	event := models.DocumentProgressEvent{
		Type:       rmq.RoutingProgress,
		DocumentID: documentID,
		Stage:      stage,
		Done:       done,
		Total:      total,
		Timestamp:  time.Now().UTC(),
	}
	return p.publish(rmq.RoutingProgress, event)
}

func (p *Publisher) PublishFailed(documentID, errorReason string) error {
	event := models.DocumentFailedEvent{
		Type:        rmq.RoutingFailed,
		DocumentID:  documentID,
		ErrorReason: errorReason,
		Timestamp:   time.Now().UTC(),
	}
	return p.publish(rmq.RoutingFailed, event)
}

func (p *Publisher) PublishPaused(documentID string) error {
	event := models.DocumentPausedEvent{
		Type:       rmq.RoutingPaused,
		DocumentID: documentID,
		Timestamp:  time.Now().UTC(),
	}
	return p.publish(rmq.RoutingPaused, event)
}

func (p *Publisher) publish(routingKey string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", routingKey, err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		if err := p.ensureChannelLocked(); err != nil {
			return err
		}

		lastErr = p.ch.Publish(
			rmq.ExchangeName,
			routingKey,
			false,
			false,
			amqp.Publishing{
				ContentType:  "application/json",
				DeliveryMode: amqp.Persistent,
				Type:         routingKey,
				Timestamp:    time.Now().UTC(),
				Body:         body,
			},
		)
		if lastErr == nil {
			return nil
		}
		p.closeLocked()
	}

	return fmt.Errorf("publish %s: %w", routingKey, lastErr)
}

func (p *Publisher) ensureChannelLocked() error {
	if p.conn != nil && !p.conn.IsClosed() && p.ch != nil && !p.ch.IsClosed() {
		return nil
	}

	p.closeLocked()

	conn := rmq.Connect(p.url)
	ch, err := rmq.OpenChannel(conn)
	if err != nil {
		_ = conn.Close()
		return err
	}
	if err := rmq.SetupTopology(ch); err != nil {
		_ = ch.Close()
		_ = conn.Close()
		return fmt.Errorf("topology: %w", err)
	}

	p.conn = conn
	p.ch = ch
	return nil
}

func (p *Publisher) closeLocked() {
	if p.ch != nil {
		_ = p.ch.Close()
		p.ch = nil
	}
	if p.conn != nil {
		_ = p.conn.Close()
		p.conn = nil
	}
}
