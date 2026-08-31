package rabbitmq

import (
	"fmt"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	ExchangeName = "system.events"
	JobsQueue    = "background.jobs.queue"
	RoutingJobs  = "job.#"
)

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

func Consume(ch *amqp.Channel, queueName string, prefetch int) (<-chan amqp.Delivery, error) {
	if prefetch > 0 {
		if err := ch.Qos(prefetch, 0, false); err != nil {
			return nil, fmt.Errorf("qos: %w", err)
		}
	}
	return ch.Consume(queueName, "", false, false, false, false, nil)
}
