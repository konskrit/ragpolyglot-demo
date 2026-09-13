package llm

import (
	"strings"
	"testing"
)

func TestGenerateNoContext(t *testing.T) {
	answer, err := Generate(t.Context(), "what is this?", nil)
	if err != nil {
		t.Fatal(err)
	}
	if answer != noContextAnswer {
		t.Fatalf("got %q", answer)
	}
}

func TestGenerateRequiresModel(t *testing.T) {
	t.Setenv("LLM_MODEL", "")
	_, err := Generate(t.Context(), "q?", []string{"chunk"})
	if err == nil || !strings.Contains(err.Error(), "LLM_MODEL not configured") {
		t.Fatalf("got err=%v", err)
	}
}

func TestUserPrompt(t *testing.T) {
	got := userPrompt("q?", []string{"chunk one"})
	if !strings.Contains(got, "Context:") || !strings.Contains(got, "chunk one") || !strings.Contains(got, "q?") {
		t.Fatalf("got %q", got)
	}
}

func TestPickStreamAnswer(t *testing.T) {
	if pickStreamAnswer(" answer ", "think") != " answer " {
		t.Fatal("prefer content")
	}
	if pickStreamAnswer("  ", "think hard") != "think hard" {
		t.Fatal("fallback reasoning")
	}
	if pickStreamAnswer("", "") != "" {
		t.Fatal("both empty")
	}
}
