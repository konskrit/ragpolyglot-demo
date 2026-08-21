package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"

	"apps/event-processor/models"
	rmq "apps/event-processor/rabbitmq"
	"apps/event-processor/storage"
)

type Runner struct {
	store         *storage.Store
	redis         *redis.Client
	logRetentionD int
}

func NewRunner(store *storage.Store, redisClient *redis.Client, logRetentionDays int) *Runner {
	return &Runner{
		store:         store,
		redis:         redisClient,
		logRetentionD: logRetentionDays,
	}
}

func (r *Runner) Start(conn *amqp.Connection) {
	go r.consume(conn)
	log.Printf("[Jobs] listening on %s", rmq.JobsQueue)
}

func (r *Runner) consume(conn *amqp.Connection) {
	ch := rmq.OpenChannel(conn)
	defer ch.Close()

	if err := rmq.SetupTopology(ch); err != nil {
		log.Fatalf("[Jobs] topology setup failed: %v", err)
	}

	msgs, err := rmq.Consume(ch, rmq.JobsQueue)
	if err != nil {
		log.Fatalf("[Jobs] consume failed: %v", err)
	}

	for msg := range msgs {
		r.handle(msg)
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
			_ = msg.Nack(false, true)
			return
		}
		if !acquired {
			log.Printf("[Jobs] already locked, skip id=%s", job.ID)
			_ = msg.Ack(false)
			return
		}
		defer r.releaseLock(ctx, job.ID)
	}

	result, err := r.dispatch(ctx, job)
	duration := time.Since(start)

	if err != nil {
		if isUnknownJob(err) {
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
	default:
		return nil, unknownJobError(job.Type)
	}
}

func (r *Runner) cleanupExpiredSessions(ctx context.Context) (map[string]any, error) {
	if r.redis == nil {
		return nil, fmt.Errorf("redis unavailable")
	}

	cleaned := 0
	var cursor uint64
	for {
		keys, next, err := r.redis.Scan(ctx, cursor, "session:*", 100).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			ttl, err := r.redis.TTL(ctx, key).Result()
			if err != nil {
				continue
			}
			if ttl == -1 {
				if err := r.redis.Del(ctx, key).Err(); err == nil {
					cleaned++
				}
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}

	return map[string]any{"cleanedSessions": cleaned}, nil
}

func (r *Runner) cleanupStaleJobLocks(ctx context.Context) (map[string]any, error) {
	if r.redis == nil {
		return nil, fmt.Errorf("redis unavailable")
	}

	cleaned := 0
	var cursor uint64
	for {
		keys, next, err := r.redis.Scan(ctx, cursor, "job:*:processing", 100).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			ttl, err := r.redis.TTL(ctx, key).Result()
			if err != nil {
				continue
			}
			if ttl == -1 {
				if err := r.redis.Del(ctx, key).Err(); err == nil {
					cleaned++
				}
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}

	return map[string]any{"cleanedLocks": cleaned}, nil
}

func (r *Runner) archiveOldLogs(ctx context.Context, payload map[string]any) (map[string]any, error) {
	days := r.logRetentionD
	if v, ok := intFromPayload(payload, "retentionDays"); ok {
		days = v
	}

	systemMoved, queryMoved, err := r.store.ArchiveOldLogs(ctx, days)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"retentionDays":      days,
		"systemLogsArchived": systemMoved,
		"queryLogsArchived":  queryMoved,
	}, nil
}

func (r *Runner) purgeArchivedLogs(ctx context.Context, payload map[string]any) (map[string]any, error) {
	days := r.logRetentionD * 3
	if v, ok := intFromPayload(payload, "retentionDays"); ok {
		days = v
	}

	systemDeleted, queryDeleted, err := r.store.PurgeArchivedLogs(ctx, days)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"retentionDays":    days,
		"systemLogsPurged": systemDeleted,
		"queryLogsPurged":  queryDeleted,
	}, nil
}

func (r *Runner) snapshotRedisStats(ctx context.Context) (map[string]any, error) {
	if r.redis == nil {
		return nil, fmt.Errorf("redis unavailable")
	}

	info, err := r.redis.Info(ctx, "memory").Result()
	if err != nil {
		return nil, err
	}

	completed, _ := r.redis.Get(ctx, "metrics:event-processor:jobs_completed").Int64()
	stats := map[string]any{
		"jobsCompleted": completed,
		"infoBytes":     len(info),
	}

	r.store.LogSystem(ctx, "redis.stats", 0, stats)
	return stats, nil
}

func (r *Runner) acquireLock(ctx context.Context, jobID string) (bool, error) {
	key := "job:" + jobID + ":processing"
	return r.redis.SetNX(ctx, key, "1", 5*time.Minute).Result()
}

func (r *Runner) releaseLock(ctx context.Context, jobID string) {
	_ = r.redis.Del(ctx, "job:"+jobID+":processing").Err()
}

func intFromPayload(payload map[string]any, key string) (int, bool) {
	if payload == nil {
		return 0, false
	}
	raw, ok := payload[key]
	if !ok {
		return 0, false
	}
	switch v := raw.(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	case string:
		n, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

type unknownJob string

func (e unknownJob) Error() string { return "unknown job type: " + string(e) }

func unknownJobError(t string) error { return unknownJob(t) }

func isUnknownJob(err error) bool {
	_, ok := err.(unknownJob)
	return ok
}
