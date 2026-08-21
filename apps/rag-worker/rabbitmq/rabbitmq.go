package rabbitmq

import (
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	ExchangeName   = "document.events"
	UploadedQueue  = "document.uploaded.queue"
	DeletedQueue   = "document.deleted.queue"
	ProcessedQueue = "document.processed.queue"
	FailedQueue    = "document.failed.queue"

	RoutingUploaded  = "document.uploaded"
	RoutingDeleted   = "document.deleted"
	RoutingProcessed = "document.processed"
	RoutingFailed    = "document.failed"
)

func Connect(url string) *amqp.Connection {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatalf("[RabbitMQ] connect failed: %v", err)
	}
	return conn
}

func OpenChannel(conn *amqp.Connection) *amqp.Channel {
	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("[RabbitMQ] open channel failed: %v", err)
	}
	return ch
}

func SetupTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(ExchangeName, "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare exchange: %w", err)
	}

	queues := []struct {
		name       string
		routingKey string
	}{
		{UploadedQueue, RoutingUploaded},
		{DeletedQueue, RoutingDeleted},
		{ProcessedQueue, RoutingProcessed},
		{FailedQueue, RoutingFailed},
	}

	for _, q := range queues {
		if _, err := ch.QueueDeclare(q.name, true, false, false, false, nil); err != nil {
			return fmt.Errorf("declare queue %s: %w", q.name, err)
		}
		if err := ch.QueueBind(q.name, q.routingKey, ExchangeName, false, nil); err != nil {
			return fmt.Errorf("bind queue %s: %w", q.name, err)
		}
	}

	return nil
}

func Consume(ch *amqp.Channel, queueName string) (<-chan amqp.Delivery, error) {
	return ch.Consume(queueName, "", false, false, false, false, nil)
}
