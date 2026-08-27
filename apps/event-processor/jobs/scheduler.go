package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"apps/event-processor/models"
	rmq "apps/event-processor/rabbitmq"
)

func schedulerLoop(rabbitURL string) {
	var lastSnapshot, lastLocks, lastArchive, lastPurge time.Time

	for {
		conn, err := amqp.Dial(rabbitURL)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		ch, err := conn.Channel()
		if err != nil {
			_ = conn.Close()
			time.Sleep(2 * time.Second)
			continue
		}
		if err := rmq.SetupTopology(ch); err != nil {
			_ = ch.Close()
			_ = conn.Close()
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("[Scheduler] connected")
		lastSnapshot = publishDue(ch, models.JobSnapshotRedisStats, lastSnapshot, time.Minute)

		ticker := time.NewTicker(time.Minute)
		closed := ch.NotifyClose(make(chan *amqp.Error, 1))

	loop:
		for {
			select {
			case <-closed:
				break loop
			case <-ticker.C:
				lastSnapshot = publishDue(ch, models.JobSnapshotRedisStats, lastSnapshot, time.Minute)
				lastLocks = publishDue(ch, models.JobCleanupStaleJobLocks, lastLocks, 5*time.Minute)
				lastArchive = publishDue(ch, models.JobArchiveOldLogs, lastArchive, 24*time.Hour)
				lastPurge = publishDue(ch, models.JobPurgeArchivedLogs, lastPurge, 7*24*time.Hour)
			}
		}

		ticker.Stop()
		_ = ch.Close()
		_ = conn.Close()
		log.Printf("[Scheduler] disconnected; reconnecting")
		time.Sleep(2 * time.Second)
	}
}

// publishDue publishes when last is zero or interval has elapsed.
// last is only advanced on successful publish.
func publishDue(ch *amqp.Channel, jobType string, last time.Time, every time.Duration) time.Time {
	now := time.Now()
	if !last.IsZero() && now.Sub(last) < every {
		return last
	}
	if !publishJob(ch, jobType) {
		return last
	}
	return now
}

func publishJob(ch *amqp.Channel, jobType string) bool {
	job := models.BackgroundJob{
		ID:        fmt.Sprintf("%s-%d", jobType, time.Now().UnixNano()),
		Type:      jobType,
		CreatedAt: time.Now().UTC(),
	}
	body, err := json.Marshal(job)
	if err != nil {
		log.Printf("[Scheduler] marshal %s: %v", jobType, err)
		return false
	}

	err = ch.PublishWithContext(context.Background(), rmq.ExchangeName, "job."+jobType, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         body,
	})
	if err != nil {
		log.Printf("[Scheduler] publish %s: %v", jobType, err)
		return false
	}
	log.Printf("[Scheduler] published type=%s id=%s", job.Type, job.ID)
	return true
}
