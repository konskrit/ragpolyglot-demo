package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"

	"apps/event-processor/config"
	"apps/event-processor/models"
	rmq "apps/event-processor/rabbitmq"
	"apps/event-processor/storage"
)

var errUnknownJob = errors.New("unknown job type")

const requeueBackoff = 2 * time.Second

type Runner struct {
	store                 *storage.Store
	redis                 *redis.Client
	logRetentionD         int
	documentServiceURL    string
	rabbitMQManagementURL string
	httpClient            *http.Client
}

func NewRunner(store *storage.Store, redisClient *redis.Client, cfg *config.Config) *Runner {
	return &Runner{
		store:                 store,
		redis:                 redisClient,
		logRetentionD:         cfg.LogRetentionD,
		documentServiceURL:    cfg.DocumentServiceURL,
		rabbitMQManagementURL: cfg.RabbitMQManagementURL,
		httpClient:            &http.Client{Timeout: 30 * time.Second},
	}
}

func (r *Runner) Start(rabbitURL string, autoRetryEvery time.Duration) {
	go r.reconnectLoop(rabbitURL)
	go schedulerLoop(rabbitURL, autoRetryEvery)
	log.Printf("[Jobs] listening on %s (scheduler enabled)", rmq.JobsQueue)
}

func (r *Runner) reconnectLoop(rabbitURL string) {
	waiting := false
	for {
		conn, err := amqp.Dial(rabbitURL)
		if err != nil {
			if !waiting {
				log.Printf("[Jobs] waiting for RabbitMQ: %v", err)
				waiting = true
			}
			time.Sleep(2 * time.Second)
			continue
		}

		ch, err := conn.Channel()
		if err != nil {
			_ = conn.Close()
			if !waiting {
				log.Printf("[Jobs] waiting for channel: %v", err)
				waiting = true
			}
			time.Sleep(2 * time.Second)
			continue
		}

		if err := rmq.SetupTopology(ch); err != nil {
			_ = ch.Close()
			_ = conn.Close()
			if !waiting {
				log.Printf("[Jobs] waiting for topology: %v", err)
				waiting = true
			}
			time.Sleep(2 * time.Second)
			continue
		}

		msgs, err := rmq.Consume(ch, rmq.JobsQueue, 1)
		if err != nil {
			_ = ch.Close()
			_ = conn.Close()
			if !waiting {
				log.Printf("[Jobs] waiting to consume: %v", err)
				waiting = true
			}
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("[Jobs] connected queue=%s", rmq.JobsQueue)
		waiting = false
		for msg := range msgs {
			r.handle(msg)
		}

		_ = ch.Close()
		_ = conn.Close()
		log.Printf("[Jobs] disconnected; reconnecting")
		waiting = true
	}
}

func (r *Runner) handle(msg amqp.Delivery) {
	var job models.BackgroundJob
	if err := json.Unmarshal(msg.Body, &job); err != nil {
		log.Printf("[Jobs] poison message (bad JSON): %v", err)
		_ = msg.Nack(false, false)
		return
	}

	if job.ID == "" || job.Type == "" {
		log.Printf("[Jobs] poison message (missing id/type)")
		_ = msg.Nack(false, false)
		return
	}

	ctx := context.Background()
	start := time.Now()
	log.Printf("[Jobs] start id=%s type=%s", job.ID, job.Type)

	if r.redis != nil {
		acquired, err := r.acquireLock(ctx, job.ID)
		if err != nil {
			log.Printf("[Jobs] lock error id=%s: %v", job.ID, err)
			time.Sleep(requeueBackoff)
			_ = msg.Nack(false, true)
			return
		}
		if !acquired {
			// Redelivery while lock TTL remains (e.g. after crash). Brief backoff
			// avoids a tight requeue loop; same message runs once the lock expires.
			log.Printf("[Jobs] already locked, backoff requeue id=%s", job.ID)
			time.Sleep(requeueBackoff)
			_ = msg.Nack(false, true)
			return
		}
		defer r.releaseLock(ctx, job.ID)
	}

	result, err := r.dispatch(ctx, job)
	duration := time.Since(start)

	if err != nil {
		if errors.Is(err, errUnknownJob) {
			log.Printf("[Jobs] unknown type=%s id=%s", job.Type, job.ID)
			r.store.LogSystem(ctx, "job.unknown", duration, map[string]any{
				"jobId": job.ID,
				"type":  job.Type,
			})
			_ = msg.Ack(false)
			return
		}

		log.Printf("[Jobs] failed id=%s type=%s: %v", job.ID, job.Type, err)
		r.store.LogSystem(ctx, "job.failed", duration, map[string]any{
			"jobId": job.ID,
			"type":  job.Type,
			"error": err.Error(),
		})
		time.Sleep(requeueBackoff)
		_ = msg.Nack(false, true)
		return
	}

	meta := map[string]any{
		"jobId": job.ID,
		"type":  job.Type,
	}
	for k, v := range result {
		meta[k] = v
	}
	r.store.LogSystem(ctx, "job.completed", duration, meta)

	if r.redis != nil {
		_ = r.redis.Incr(ctx, "metrics:event-processor:jobs_completed").Err()
	}

	_ = msg.Ack(false)
	log.Printf("[Jobs] completed id=%s type=%s duration=%s", job.ID, job.Type, duration)
}

func (r *Runner) dispatch(ctx context.Context, job models.BackgroundJob) (map[string]any, error) {
	switch job.Type {
	case models.JobCleanupExpiredSessions:
		return r.cleanupExpiredSessions(ctx)
	case models.JobCleanupStaleJobLocks:
		return r.cleanupStaleJobLocks(ctx)
	case models.JobArchiveOldLogs:
		return r.archiveOldLogs(ctx, job.Payload)
	case models.JobPurgeArchivedLogs:
		return r.purgeArchivedLogs(ctx, job.Payload)
	case models.JobSnapshotRedisStats:
		return r.snapshotRedisStats(ctx)
	case models.JobFailStaleProcessing:
		return r.postDocumentMaintenance(ctx, "/api/documents/maintenance/fail-stale")
	case models.JobAutoRetryFailed:
		return r.postDocumentMaintenance(ctx, "/api/documents/maintenance/auto-retry")
	default:
		return nil, fmt.Errorf("%w: %s", errUnknownJob, job.Type)
	}
}

func (r *Runner) acquireLock(ctx context.Context, jobID string) (bool, error) {
	key := lockKey(jobID)
	ok, err := r.redis.SetNX(ctx, key, "1", 5*time.Minute).Result()
	if err != nil || ok {
		return ok, err
	}

	// Immortal lock (no TTL) from an old bug/crash path — clear and retry once.
	ttl, ttlErr := r.redis.TTL(ctx, key).Result()
	if ttlErr != nil || ttl != -1 {
		return false, nil
	}
	if err := r.redis.Del(ctx, key).Err(); err != nil {
		return false, err
	}
	return r.redis.SetNX(ctx, key, "1", 5*time.Minute).Result()
}

func (r *Runner) releaseLock(ctx context.Context, jobID string) {
	_ = r.redis.Del(ctx, lockKey(jobID)).Err()
}

func lockKey(jobID string) string {
	return "job:" + jobID + ":processing"
}
