package rabbitmq

import (
	"fmt"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	ExchangeName = "system.events"
	JobsQueue    = "background.jobs.queue"
	RoutingJobs  = "job.#"
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

	if _, err := ch.QueueDeclare(JobsQueue, true, false, false, false, nil); err != nil {
		return fmt.Errorf("declare queue: %w", err)
	}

	if err := ch.QueueBind(JobsQueue, RoutingJobs, ExchangeName, false, nil); err != nil {
		return fmt.Errorf("bind queue: %w", err)
	}

	return nil
}

func Consume(ch *amqp.Channel, queueName string) (<-chan amqp.Delivery, error) {
	return ch.Consume(queueName, "", false, false, false, false, nil)
}
