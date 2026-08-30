package rabbitmq

import (
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	ExchangeName   = "document.events"
	UploadedQueue  = "document.uploaded.queue"
	DeletedQueue   = "document.deleted.queue"
	PauseQueue     = "document.pause.queue"
	ProcessedQueue = "document.processed.queue"
	FailedQueue    = "document.failed.queue"
	PausedQueue    = "document.paused.queue"
	ProgressQueue  = "document.progress.queue"

	RoutingUploaded  = "document.uploaded"
	RoutingDeleted   = "document.deleted"
	RoutingPause     = "document.pause"
	RoutingProcessed = "document.processed"
	RoutingFailed    = "document.failed"
	RoutingPaused    = "document.paused"
	RoutingProgress  = "document.progress"
)

func Connect(url string) *amqp.Connection {
	waiting := false
	for {
		conn, err := amqp.Dial(url)
		if err == nil {
			return conn
		}
		if !waiting {
			log.Printf("[RabbitMQ] waiting for connection: %v", err)
			waiting = true
		}
		time.Sleep(2 * time.Second)
	}
}

func OpenChannel(conn *amqp.Connection) (*amqp.Channel, error) {
	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("open channel: %w", err)
	}
	return ch, nil
}

func SetupTopology(ch *amqp.Channel) error {
	if err := ch.ExchangeDeclare(ExchangeName, "topic", true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare exchange: %w", err)
	}

	for queue, routingKey := range map[string]string{
		UploadedQueue:  RoutingUploaded,
		DeletedQueue:   RoutingDeleted,
		PauseQueue:     RoutingPause,
		ProcessedQueue: RoutingProcessed,
		FailedQueue:    RoutingFailed,
		PausedQueue:    RoutingPaused,
		ProgressQueue:  RoutingProgress,
	} {
		if _, err := ch.QueueDeclare(queue, true, false, false, false, nil); err != nil {
			return fmt.Errorf("declare queue %s: %w", queue, err)
		}
		if err := ch.QueueBind(queue, routingKey, ExchangeName, false, nil); err != nil {
			return fmt.Errorf("bind queue %s: %w", queue, err)
		}
	}

	return nil
}

func Consume(ch *amqp.Channel, queueName string, prefetch int) (<-chan amqp.Delivery, error) {
	if prefetch > 0 {
		if err := ch.Qos(prefetch, 0, false); err != nil {
			return nil, fmt.Errorf("qos: %w", err)
		}
	}
	return ch.Consume(queueName, "", false, false, false, false, nil)
}
