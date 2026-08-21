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
	ch *amqp.Channel
	mu sync.Mutex
}

func New(ch *amqp.Channel) *Publisher {
	return &Publisher{ch: ch}
}

func (p *Publisher) PublishProcessed(documentID string, chunkCount int) error {
	event := models.DocumentProcessedEvent{
		Type:       rmq.RoutingProcessed,
		DocumentID: documentID,
		ChunkCount: chunkCount,
		Timestamp:  time.Now().UTC(),
	}
	return p.publish(rmq.RoutingProcessed, event)
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

func (p *Publisher) publish(routingKey string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", routingKey, err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	err = p.ch.Publish(
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
		return fmt.Errorf("publish %s: %w", routingKey, err)
	}
	return nil
}
