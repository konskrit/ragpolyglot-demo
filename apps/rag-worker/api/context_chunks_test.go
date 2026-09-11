package api

import (
	"strings"
	"testing"

	"apps/rag-worker/models"
)

func TestLabelChunk(t *testing.T) {
	got := labelChunk(models.SearchHit{
		DocumentTitle: "Ethics",
		ChunkIndex:    2,
	})
	if got != "[Ethics #3]" {
		t.Fatalf("got %q", got)
	}
}

func TestBuildContextChunks(t *testing.T) {
	hits := []models.SearchHit{
		{DocumentTitle: "A", ChunkIndex: 0, Content: "alpha"},
		{DocumentTitle: "B", ChunkIndex: 1, Content: "   "},
		{DocumentTitle: "C", ChunkIndex: 2, Content: "gamma"},
	}
	chunks := buildContextChunks(hits)
	if len(chunks) != 2 {
		t.Fatalf("got %#v", chunks)
	}
	if !strings.HasPrefix(chunks[0], "[A #1]\n") || !strings.Contains(chunks[0], "alpha") {
		t.Fatalf("chunk0=%q", chunks[0])
	}
	if !strings.Contains(chunks[1], "gamma") {
		t.Fatalf("chunk1=%q", chunks[1])
	}
}
