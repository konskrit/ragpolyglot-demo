package consumer

import (
	"context"
	"testing"
)

func TestIsResumableFailure(t *testing.T) {
	if !isResumableFailure("embedding_error") {
		t.Fatal("embedding_error should be resumable")
	}
	if !isResumableFailure("storage_error") {
		t.Fatal("storage_error should be resumable")
	}
	if isResumableFailure("chunking_error") {
		t.Fatal("chunking_error should not be resumable")
	}
}

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
