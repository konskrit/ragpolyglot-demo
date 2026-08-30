package storage

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
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
	row := s.pool.QueryRow(ctx, `
SELECT document_id::text, stage, ocr_page_done, ocr_total, ocr_langs, ocr_lang_hint,
       partial_text, embed_done, file_path, paused
FROM document_ingest_checkpoints
WHERE document_id = $1`, documentID)

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
	_, err := s.pool.Exec(ctx, `
INSERT INTO document_ingest_checkpoints (
    document_id, stage, ocr_page_done, ocr_total, ocr_langs, ocr_lang_hint,
    partial_text, embed_done, file_path, paused, updated_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
ON CONFLICT (document_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    ocr_page_done = EXCLUDED.ocr_page_done,
    ocr_total = EXCLUDED.ocr_total,
    ocr_langs = EXCLUDED.ocr_langs,
    ocr_lang_hint = EXCLUDED.ocr_lang_hint,
    partial_text = EXCLUDED.partial_text,
    embed_done = EXCLUDED.embed_done,
    file_path = EXCLUDED.file_path,
    paused = EXCLUDED.paused,
    updated_at = NOW()`,
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
	_, err := s.pool.Exec(ctx, `DELETE FROM document_ingest_checkpoints WHERE document_id = $1`, documentID)
	return err
}
