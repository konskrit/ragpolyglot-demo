package publisher

import (
	"encoding/json"
	"fmt"
	"log"
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

// New blocks until RabbitMQ accepts the first connection, like the rest of the
// worker's startup. Later drops are re-dialled on the next publish.
func New(url string) *Publisher {
	p := &Publisher{url: url, conn: rmq.Connect(url)}
	if err := p.openChannel(); err != nil {
		log.Printf("[Publisher] channel setup failed: %v", err)
		p.drop()
	}
	return p
}

func (p *Publisher) Connected() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.ch != nil && !p.ch.IsClosed()
}

func (p *Publisher) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.drop()
}

// liveChannel re-dials once if the current channel is gone. Caller holds mu.
func (p *Publisher) liveChannel() (*amqp.Channel, error) {
	if p.ch != nil && !p.ch.IsClosed() {
		return p.ch, nil
	}
	p.drop()

	conn, err := amqp.Dial(p.url)
	if err != nil {
		return nil, err
	}
	p.conn = conn
	if err := p.openChannel(); err != nil {
		p.drop()
		return nil, err
	}
	log.Printf("[Publisher] reconnected")
	return p.ch, nil
}

func (p *Publisher) openChannel() error {
	ch, err := rmq.OpenChannel(p.conn)
	if err != nil {
		return err
	}
	if err := rmq.SetupTopology(ch); err != nil {
		_ = ch.Close()
		return err
	}
	p.ch = ch
	return nil
}

func (p *Publisher) drop() {
	if p.ch != nil {
		_ = p.ch.Close()
		p.ch = nil
	}
	if p.conn != nil {
		_ = p.conn.Close()
		p.conn = nil
	}
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

	ch, err := p.liveChannel()
	if err != nil {
		return fmt.Errorf("publish %s: %w", routingKey, err)
	}

	err = ch.Publish(
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
	if err != nil {
		p.drop()
		return fmt.Errorf("publish %s: %w", routingKey, err)
	}
	return nil
}
