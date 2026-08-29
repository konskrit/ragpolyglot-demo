package models

import "time"

type BackgroundJob struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload"`
	CreatedAt time.Time      `json:"createdAt"`
}

const (
	JobCleanupExpiredSessions = "cleanup_expired_sessions"
	JobCleanupStaleJobLocks   = "cleanup_stale_job_locks"
	JobArchiveOldLogs         = "archive_old_logs"
	JobPurgeArchivedLogs      = "purge_archived_logs"
	JobSnapshotRedisStats     = "snapshot_redis_stats"
	JobFailStaleProcessing    = "fail_stale_processing"
	JobAutoRetryFailed        = "auto_retry_failed"
)
