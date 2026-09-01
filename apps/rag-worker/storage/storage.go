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
	ragsql "apps/rag-worker/sql"
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
	_, err := s.pool.Exec(ctx, ragsql.Must("schema.sql"))
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

	insertChunk := ragsql.Must("insert_chunk.sql")
	for _, chunk := range chunks {
		_, err := tx.Exec(ctx, insertChunk,
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
	tag, err := s.pool.Exec(ctx, ragsql.Must("delete_chunks.sql"), documentID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *Store) CountChunks(ctx context.Context, documentID string) (int64, error) {
	var n int64
	err := s.pool.QueryRow(ctx, ragsql.Must("count_chunks.sql"), documentID).Scan(&n)
	return n, err
}

func (s *Store) SearchSimilar(ctx context.Context, embedding []float32, topK int) ([]models.SearchHit, error) {
	rows, err := s.pool.Query(ctx, ragsql.Must("search_similar.sql"),
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

	_, _ = s.pool.Exec(ctx, ragsql.Must("log_system.sql"),
		eventType, docID, metaJSON, float64(duration.Milliseconds()),
	)
}

func (s *Store) LogQuery(ctx context.Context, query string, topK, resultCount int, duration time.Duration) {
	_, _ = s.pool.Exec(ctx, ragsql.Must("log_query.sql"),
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
