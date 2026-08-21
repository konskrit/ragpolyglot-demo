package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) EnsureSchema(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    service TEXT NOT NULL,
    event_type TEXT NOT NULL,
    document_id UUID,
    metadata JSONB,
    duration_ms DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_logs (
    id BIGSERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    top_k INT NOT NULL,
    result_count INT NOT NULL,
    duration_ms DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_logs_archive (
    id BIGINT PRIMARY KEY,
    service TEXT NOT NULL,
    event_type TEXT NOT NULL,
    document_id UUID,
    metadata JSONB,
    duration_ms DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_logs_archive (
    id BIGINT PRIMARY KEY,
    query TEXT NOT NULL,
    top_k INT NOT NULL,
    result_count INT NOT NULL,
    duration_ms DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ DEFAULT NOW()
);
`)
	return err
}

func (s *Store) LogSystem(ctx context.Context, eventType string, duration time.Duration, metadata map[string]any) {
	var metaJSON []byte
	if metadata != nil {
		metaJSON, _ = json.Marshal(metadata)
	}

	_, _ = s.pool.Exec(ctx, `
INSERT INTO system_logs (service, event_type, metadata, duration_ms)
VALUES ('event-processor', $1, $2, $3)`,
		eventType, metaJSON, float64(duration.Milliseconds()),
	)
}

func (s *Store) ArchiveOldLogs(ctx context.Context, retentionDays int) (systemMoved, queryMoved int64, err error) {
	if retentionDays < 1 {
		retentionDays = 30
	}

	tag, err := s.pool.Exec(ctx, `
WITH moved AS (
    DELETE FROM system_logs
    WHERE created_at < NOW() - make_interval(days => $1)
    RETURNING id, service, event_type, document_id, metadata, duration_ms, created_at
)
INSERT INTO system_logs_archive (id, service, event_type, document_id, metadata, duration_ms, created_at)
SELECT id, service, event_type, document_id, metadata, duration_ms, created_at FROM moved`,
		retentionDays,
	)
	if err != nil {
		return 0, 0, fmt.Errorf("archive system_logs: %w", err)
	}
	systemMoved = tag.RowsAffected()

	tag, err = s.pool.Exec(ctx, `
WITH moved AS (
    DELETE FROM query_logs
    WHERE created_at < NOW() - make_interval(days => $1)
    RETURNING id, query, top_k, result_count, duration_ms, created_at
)
INSERT INTO query_logs_archive (id, query, top_k, result_count, duration_ms, created_at)
SELECT id, query, top_k, result_count, duration_ms, created_at FROM moved`,
		retentionDays,
	)
	if err != nil {
		return systemMoved, 0, fmt.Errorf("archive query_logs: %w", err)
	}
	queryMoved = tag.RowsAffected()
	return systemMoved, queryMoved, nil
}

func (s *Store) PurgeArchivedLogs(ctx context.Context, retentionDays int) (systemDeleted, queryDeleted int64, err error) {
	if retentionDays < 1 {
		retentionDays = 90
	}

	tag, err := s.pool.Exec(ctx, `
DELETE FROM system_logs_archive
WHERE archived_at < NOW() - make_interval(days => $1)`,
		retentionDays,
	)
	if err != nil {
		return 0, 0, fmt.Errorf("purge system_logs_archive: %w", err)
	}
	systemDeleted = tag.RowsAffected()

	tag, err = s.pool.Exec(ctx, `
DELETE FROM query_logs_archive
WHERE archived_at < NOW() - make_interval(days => $1)`,
		retentionDays,
	)
	if err != nil {
		return systemDeleted, 0, fmt.Errorf("purge query_logs_archive: %w", err)
	}
	queryDeleted = tag.RowsAffected()
	return systemDeleted, queryDeleted, nil
}

func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}
