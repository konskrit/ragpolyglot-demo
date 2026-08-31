package consumer

import amqp "github.com/rabbitmq/amqp091-go"

type ingestAck struct {
	msg  amqp.Delivery
	done bool
}

func newIngestAck(msg amqp.Delivery) *ingestAck {
	return &ingestAck{msg: msg}
}

func (a *ingestAck) ack() {
	if a == nil || a.done {
		return
	}
	a.done = true
	_ = a.msg.Ack(false)
}

func (a *ingestAck) nack(requeue bool) {
	if a == nil || a.done {
		return
	}
	a.done = true
	_ = a.msg.Nack(false, requeue)
}

func (a *ingestAck) settled() bool {
	return a == nil || a.done
}
