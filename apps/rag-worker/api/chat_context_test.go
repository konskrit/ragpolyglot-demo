package api

import (
	"strings"
	"testing"
	"unicode/utf8"

	"apps/rag-worker/models"
)

func TestNormalizeChatMode(t *testing.T) {
	if NormalizeChatMode("") != "fast" || NormalizeChatMode("FAST") != "fast" {
		t.Fatal("expected fast")
	}
	if NormalizeChatMode("deep") != "deep" || NormalizeChatMode("Deep") != "deep" {
		t.Fatal("expected deep")
	}
}

func TestAssembleChatChunks(t *testing.T) {
	got := assembleChatChunks([]string{"s"}, []string{"e1", "e2"})
	if len(got) != 3 || got[0] != "s" || got[2] != "e2" {
		t.Fatalf("got %#v", got)
	}
}

func TestIsNoneExtract(t *testing.T) {
	if !isNoneExtract("NONE") || !isNoneExtract("None.") || !isNoneExtract("") {
		t.Fatal("expected NONE/empty")
	}
	if isNoneExtract("detail about taxes") {
		t.Fatal("unexpected NONE")
	}
}

func TestChatMapBudgetLeavesRoom(t *testing.T) {
	b := chatMapBudget("short question")
	if b >= chatMapContextChars() {
		t.Fatalf("budget %d should be below max %d", b, chatMapContextChars())
	}
	if b < 1000 {
		t.Fatalf("budget too small: %d", b)
	}
}

func TestChatMapMaxTokens(t *testing.T) {
	t.Setenv("RAG_CHAT_MAP_MAX_TOKENS", "")
	if chatMapMaxTokens() != defaultChatMapMaxTokens {
		t.Fatalf("default got %d", chatMapMaxTokens())
	}
	t.Setenv("RAG_CHAT_MAP_MAX_TOKENS", "4096")
	if chatMapMaxTokens() != 4096 {
		t.Fatalf("env got %d", chatMapMaxTokens())
	}
	t.Setenv("RAG_CHAT_MAP_MAX_TOKENS", "10")
	if chatMapMaxTokens() != defaultChatMapMaxTokens {
		t.Fatalf("low clamp got %d", chatMapMaxTokens())
	}
}

func TestCompressEvidenceSingleBatchUsesPacked(t *testing.T) {
	big := strings.Repeat("x", chatMapBudget("q")+500)
	out, err := compressEvidence(t.Context(), "q", []string{big}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("got %#v", out)
	}
	if utf8.RuneCountInString(out[0]) > chatMapBudget("q") {
		t.Fatalf("expected truncation, got %d runes", utf8.RuneCountInString(out[0]))
	}
}

func TestUniqueDocumentIDs(t *testing.T) {
	got := uniqueDocumentIDs([]models.SearchHit{
		{DocumentID: "a"},
		{DocumentID: "b"},
		{DocumentID: "a"},
	})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("got %#v", got)
	}
}

func TestBuildSummaryChunks(t *testing.T) {
	got := buildSummaryChunks([]models.DocumentSummaryHit{
		{DocumentID: "id1", DocumentTitle: "Report", Content: "[Document summary]\nHello"},
		{DocumentID: "id2", DocumentTitle: "", Content: "  "},
	})
	if len(got) != 1 {
		t.Fatalf("got %#v", got)
	}
	if got[0] != "[Report · summary]\n[Document summary]\nHello" {
		t.Fatalf("label %#v", got[0])
	}
}

func TestAnswerChunksFastSkipsMap(t *testing.T) {
	prep := &chatPrep{mode: "fast", evidence: []string{"a", "b"}}
	got, err := answerChunks(t.Context(), prep, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "a" {
		t.Fatalf("got %#v", got)
	}
}
