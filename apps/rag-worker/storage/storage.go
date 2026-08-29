package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"apps/rag-worker/models"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
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
`)
	return err
}

func (s *Store) InsertChunks(ctx context.Context, chunks []models.DocumentChunk) error {
	if len(chunks) == 0 {
		return nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, chunk := range chunks {
		_, err := tx.Exec(ctx, `
INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
VALUES ($1, $2, $3, $4::vector)`,
			chunk.DocumentID,
			chunk.ChunkIndex,
			chunk.Content,
			vectorLiteral(chunk.Embedding),
		)
		if err != nil {
			return fmt.Errorf("insert chunk %d: %w", chunk.ChunkIndex, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

func (s *Store) DeleteChunks(ctx context.Context, documentID string) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM document_chunks WHERE document_id = $1`, documentID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *Store) SearchSimilar(ctx context.Context, embedding []float32, topK int) ([]models.SearchHit, error) {
	rows, err := s.pool.Query(ctx, `
SELECT document_id::text, chunk_index, content, 1 - (embedding <=> $1::vector) AS similarity
FROM document_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT $2`,
		vectorLiteral(embedding),
		topK,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hits []models.SearchHit
	for rows.Next() {
		var hit models.SearchHit
		if err := rows.Scan(&hit.DocumentID, &hit.ChunkIndex, &hit.Content, &hit.Similarity); err != nil {
			return nil, err
		}
		hits = append(hits, hit)
	}
	return hits, rows.Err()
}

func (s *Store) LogSystem(ctx context.Context, eventType, documentID string, duration time.Duration, metadata map[string]any) {
	var metaJSON []byte
	if metadata != nil {
		metaJSON, _ = json.Marshal(metadata)
	}

	var docID any
	if documentID != "" {
		docID = documentID
	}

	_, _ = s.pool.Exec(ctx, `
INSERT INTO system_logs (service, event_type, document_id, metadata, duration_ms)
VALUES ('rag-worker', $1, $2, $3, $4)`,
		eventType, docID, metaJSON, float64(duration.Milliseconds()),
	)
}

func (s *Store) LogQuery(ctx context.Context, query string, topK, resultCount int, duration time.Duration) {
	_, _ = s.pool.Exec(ctx, `
INSERT INTO query_logs (query, top_k, result_count, duration_ms)
VALUES ($1, $2, $3, $4)`,
		query, topK, resultCount, float64(duration.Milliseconds()),
	)
}

func vectorLiteral(values []float32) string {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = strconv.FormatFloat(float64(v), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
