package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
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
	batch := &pgx.Batch{}
	for _, chunk := range chunks {
		batch.Queue(insertChunk,
			chunk.DocumentID,
			chunk.ChunkIndex,
			chunk.Content,
			vectorLiteral(chunk.Embedding),
		)
	}
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("insert chunks %d-%d: %w", chunks[0].ChunkIndex, chunks[len(chunks)-1].ChunkIndex, err)
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

func (s *Store) ListChunkTexts(ctx context.Context, documentID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, ragsql.Must("list_chunks_by_document.sql"), documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var texts []string
	for rows.Next() {
		var index int
		var content string
		if err := rows.Scan(&index, &content); err != nil {
			return nil, err
		}
		if t := strings.TrimSpace(content); t != "" {
			texts = append(texts, t)
		}
	}
	return texts, rows.Err()
}

func (s *Store) UpsertChunk(ctx context.Context, chunk models.DocumentChunk) error {
	_, err := s.pool.Exec(ctx, ragsql.Must("upsert_chunk.sql"),
		chunk.DocumentID,
		chunk.ChunkIndex,
		chunk.Content,
		vectorLiteral(chunk.Embedding),
	)
	return err
}

func (s *Store) ListSummaries(ctx context.Context, documentIDs []string) ([]models.DocumentSummaryHit, error) {
	if len(documentIDs) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx, ragsql.Must("list_summaries.sql"), documentIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.DocumentSummaryHit
	for rows.Next() {
		var hit models.DocumentSummaryHit
		if err := rows.Scan(&hit.DocumentID, &hit.DocumentTitle, &hit.Content); err != nil {
			return nil, err
		}
		out = append(out, hit)
	}
	return out, rows.Err()
}

func (s *Store) SearchSimilar(ctx context.Context, embedding []float32, topK int, documentIDs []string) ([]models.SearchHit, error) {
	var scope any
	if len(documentIDs) > 0 {
		scope = documentIDs
	}
	rows, err := s.pool.Query(ctx, ragsql.Must("search_similar.sql"),
		vectorLiteral(embedding),
		topK,
		scope,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hits []models.SearchHit
	for rows.Next() {
		var hit models.SearchHit
		if err := rows.Scan(
			&hit.DocumentID,
			&hit.ChunkIndex,
			&hit.Content,
			&hit.Similarity,
			&hit.DocumentTitle,
		); err != nil {
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
