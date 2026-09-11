package storage

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"

	ragsql "apps/rag-worker/sql"
)

type SummarizeCheckpoint struct {
	DocumentID   string
	Stage        string
	Done         int
	Total        int
	Partials     []string
	ContextChars int
}

func (s *Store) GetSummarizeCheckpoint(ctx context.Context, documentID string) (*SummarizeCheckpoint, error) {
	row := s.pool.QueryRow(ctx, ragsql.Must("get_summarize_checkpoint.sql"), documentID)
	var cp SummarizeCheckpoint
	var partialsJSON string
	err := row.Scan(
		&cp.DocumentID,
		&cp.Stage,
		&cp.Done,
		&cp.Total,
		&partialsJSON,
		&cp.ContextChars,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal([]byte(partialsJSON), &cp.Partials); err != nil {
		return nil, err
	}
	if cp.Partials == nil {
		cp.Partials = []string{}
	}
	return &cp, nil
}

func (s *Store) UpsertSummarizeCheckpoint(ctx context.Context, cp SummarizeCheckpoint) error {
	if cp.Partials == nil {
		cp.Partials = []string{}
	}
	raw, err := json.Marshal(cp.Partials)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, ragsql.Must("upsert_summarize_checkpoint.sql"),
		cp.DocumentID,
		cp.Stage,
		cp.Done,
		cp.Total,
		string(raw),
		cp.ContextChars,
	)
	return err
}

func (s *Store) DeleteSummarizeCheckpoint(ctx context.Context, documentID string) error {
	_, err := s.pool.Exec(ctx, ragsql.Must("delete_summarize_checkpoint.sql"), documentID)
	return err
}
