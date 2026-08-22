package llm

import (
	"strings"
	"testing"
)

func TestGenerateNoContext(t *testing.T) {
	answer, err := Generate(t.Context(), "what is this?", nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if answer != noContextAnswer {
		t.Fatalf("got %q", answer)
	}
}

func TestExtractiveAnswer(t *testing.T) {
	got := extractiveAnswer([]string{"  alpha  ", "", "beta"})
	if got != "alpha\n\nbeta" {
		t.Fatalf("got %q", got)
	}
	if extractiveAnswer(nil) != noContextAnswer {
		t.Fatal("empty chunks")
	}
}

func TestUserPrompt(t *testing.T) {
	got := userPrompt("q?", []string{"chunk one"})
	if !strings.Contains(got, "Context:") || !strings.Contains(got, "chunk one") || !strings.Contains(got, "q?") {
		t.Fatalf("got %q", got)
	}
}
