package consumer

import (
	"context"
	"testing"

	"apps/rag-worker/models"
	"apps/rag-worker/storage"
)

func TestSyncEmbedDoneFromChunks_nilStore(t *testing.T) {
	if got := syncEmbedDoneFromChunks(context.Background(), nil, "x", 5); got != 5 {
		t.Fatalf("got %d want 5", got)
	}
}

func TestWipeIngestData_nilStore(t *testing.T) {
	if err := wipeIngestData(context.Background(), nil, "x"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
	if err := wipeIngestDataWithRetry(context.Background(), nil, "x"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestDeleteCheckpointWithRetry_nilStore(t *testing.T) {
	if err := deleteCheckpointWithRetry(context.Background(), nil, "x"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestShouldResetIngest(t *testing.T) {
	cp := &storage.IngestCheckpoint{OcrLangHint: "grc"}

	if !shouldResetIngest(models.DocumentUploadedEvent{ResetIngest: true}, nil) {
		t.Fatal("ResetIngest flag should wipe")
	}
	if shouldResetIngest(models.DocumentUploadedEvent{Retry: true, OcrLang: "grc"}, cp) {
		t.Fatal("same lang retry should resume")
	}
	if !shouldResetIngest(models.DocumentUploadedEvent{Retry: true, OcrLang: "ell"}, cp) {
		t.Fatal("changed lang vs checkpoint should wipe")
	}
	if shouldResetIngest(models.DocumentUploadedEvent{Retry: true, OcrLang: "ell"}, nil) {
		t.Fatal("retry without checkpoint/flag should not wipe here")
	}
}
