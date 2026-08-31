package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func (r *Runner) cleanupExpiredSessions(ctx context.Context) (map[string]any, error) {
	if r.redis == nil {
		return nil, fmt.Errorf("redis unavailable")
	}
	cleaned, err := r.deleteKeysWithoutTTL(ctx, "session:*")
	if err != nil {
		return nil, err
	}
	return map[string]any{"cleanedSessions": cleaned}, nil
}

func (r *Runner) cleanupStaleJobLocks(ctx context.Context) (map[string]any, error) {
	if r.redis == nil {
		return nil, fmt.Errorf("redis unavailable")
	}
	cleaned, err := r.deleteKeysWithoutTTL(ctx, "job:*:processing")
	if err != nil {
		return nil, err
	}
	return map[string]any{"cleanedLocks": cleaned}, nil
}

func (r *Runner) deleteKeysWithoutTTL(ctx context.Context, pattern string) (int, error) {
	cleaned := 0
	var cursor uint64
	for {
		keys, next, err := r.redis.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return 0, err
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
	return cleaned, nil
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
	}
	if used, ok := infoInt(info, "used_memory"); ok {
		stats["usedMemoryBytes"] = used
	}
	if peak, ok := infoInt(info, "used_memory_peak"); ok {
		stats["usedMemoryPeakBytes"] = peak
	}
	stats["queues"] = normalizeQueueDepths(r.fetchQueueDepths(ctx))

	r.store.LogSystem(ctx, "redis.stats", 0, stats)
	return stats, nil
}

func (r *Runner) postDocumentMaintenance(ctx context.Context, path string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.documentServiceURL+path, nil)
	if err != nil {
		return nil, err
	}

	res, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("document-service %s: %s", res.Status, strings.TrimSpace(string(body)))
	}

	var payload map[string]any
	if len(body) == 0 {
		return map[string]any{}, nil
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return payload, nil
}
