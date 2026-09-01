package storage

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	ragsql "apps/rag-worker/sql"
)

type IngestCheckpoint struct {
	DocumentID  string
	Stage       string
	OcrPageDone int
	OcrTotal    int
	OcrLangs    string
	OcrLangHint string
	PartialText string
	EmbedDone   int
	FilePath    string
	Paused      bool
}

func (s *Store) GetCheckpoint(ctx context.Context, documentID string) (*IngestCheckpoint, error) {
	row := s.pool.QueryRow(ctx, ragsql.Must("get_checkpoint.sql"), documentID)

	var cp IngestCheckpoint
	err := row.Scan(
		&cp.DocumentID,
		&cp.Stage,
		&cp.OcrPageDone,
		&cp.OcrTotal,
		&cp.OcrLangs,
		&cp.OcrLangHint,
		&cp.PartialText,
		&cp.EmbedDone,
		&cp.FilePath,
		&cp.Paused,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &cp, nil
}

func (s *Store) UpsertCheckpoint(ctx context.Context, cp IngestCheckpoint) error {
	_, err := s.pool.Exec(ctx, ragsql.Must("upsert_checkpoint.sql"),
		cp.DocumentID,
		cp.Stage,
		cp.OcrPageDone,
		cp.OcrTotal,
		cp.OcrLangs,
		cp.OcrLangHint,
		cp.PartialText,
		cp.EmbedDone,
		cp.FilePath,
		cp.Paused,
	)
	return err
}

func (s *Store) DeleteCheckpoint(ctx context.Context, documentID string) error {
	_, err := s.pool.Exec(ctx, ragsql.Must("delete_checkpoint.sql"), documentID)
	return err
}
