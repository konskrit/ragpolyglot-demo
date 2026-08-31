package chunker

import (
	"strings"
	"testing"
)

func TestChunkText_Empty(t *testing.T) {
	if got := ChunkText("   \n\t  "); got != nil {
		t.Fatalf("expected nil, got %#v", got)
	}
}

func TestChunkText_ShortReturnsSingleChunk(t *testing.T) {
	got := ChunkText("hello world")
	if len(got) != 1 || got[0] != "hello world" {
		t.Fatalf("unexpected chunks: %#v", got)
	}
}

func TestChunkText_LongProducesMultipleChunks(t *testing.T) {
	var b strings.Builder
	for i := 0; i < 400; i++ {
		b.WriteString("This is a sentence about retrieval augmented generation. ")
	}

	chunks := ChunkText(b.String())
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}

	chunkSize := targetTokens * charsPerToken
	for i, c := range chunks[:len(chunks)-1] {
		if len([]rune(c)) > chunkSize+50 {
			t.Fatalf("chunk %d too large: %d runes", i, len([]rune(c)))
		}
		if strings.TrimSpace(c) == "" {
			t.Fatalf("chunk %d empty", i)
		}
	}
}

func TestChunkText_NormalizesWhitespace(t *testing.T) {
	got := ChunkText("line one\r\n\r\n  line two  ")
	if len(got) != 1 || got[0] != "line one line two" {
		t.Fatalf("unexpected normalize result: %#v", got)
	}
}

func TestFindBreakPoint_PrefersSentenceBoundary(t *testing.T) {
	runes := []rune("aaaa. bbbb cccc")
	got := findBreakPoint(runes, 0, len(runes))
	if got != 6 {
		t.Fatalf("expected break after sentence, got %d", got)
	}
}

func TestChunkText_WhitespaceWindowAdvances(t *testing.T) {
	chunkSize := targetTokens * charsPerToken
	var b strings.Builder
	b.WriteString(strings.Repeat(" ", chunkSize))
	b.WriteString("tail content that should still be chunked")
	chunks := ChunkText(b.String())
	if len(chunks) == 0 {
		t.Fatal("expected at least one chunk")
	}
}
