package consumer

import (
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestIngestAck_ackIdempotent(t *testing.T) {
	a := &ingestAck{msg: amqp.Delivery{}}
	a.ack()
	if !a.settled() {
		t.Fatal("expected settled after ack")
	}
	a.ack()
}

func TestIngestAck_nackSetsSettled(t *testing.T) {
	a := &ingestAck{msg: amqp.Delivery{}}
	a.nack(true)
	if !a.settled() {
		t.Fatal("expected settled after nack")
	}
	a.nack(true)
}

func TestIngestAck_ackAfterNackIsNoOp(t *testing.T) {
	a := &ingestAck{msg: amqp.Delivery{}}
	a.nack(false)
	a.ack()
	if !a.settled() {
		t.Fatal("expected settled")
	}
}
