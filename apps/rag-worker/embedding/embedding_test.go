package embedding

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHashToVector_DeterministicAndFixedDim(t *testing.T) {
	a := hashToVector("hello", 8)
	b := hashToVector("hello", 8)
	c := hashToVector("world", 8)

	if len(a) != 8 {
		t.Fatalf("dim=%d", len(a))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("not deterministic at %d", i)
		}
	}
	same := true
	for i := range a {
		if a[i] != c[i] {
			same = false
			break
		}
	}
	if same {
		t.Fatal("different inputs should produce different vectors")
	}

	var norm float64
	for _, v := range a {
		if math.IsNaN(float64(v)) {
			t.Fatal("NaN in vector")
		}
		norm += float64(v) * float64(v)
	}
	if math.Abs(math.Sqrt(norm)-1) > 1e-5 {
		t.Fatalf("expected unit vector, L2=%f", math.Sqrt(norm))
	}
}

func TestFallbackEmbeddings(t *testing.T) {
	t.Setenv("EMBEDDING_DIMENSION", "16")
	out := fallbackEmbeddings([]string{"a", "b"})
	if len(out) != 2 {
		t.Fatalf("len=%d", len(out))
	}
	if len(out[0].Embedding) != 16 || out[0].Text != "a" {
		t.Fatalf("unexpected first chunk: %#v", out[0])
	}
}

func TestJoinEmbeddingsURL(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"http://localhost:1234/v1", "http://localhost:1234/v1/embeddings"},
		{"http://localhost:1234/v1/", "http://localhost:1234/v1/embeddings"},
	}
	for _, tt := range tests {
		if got := joinEmbeddingsURL(tt.in); got != tt.want {
			t.Fatalf("joinEmbeddingsURL(%q)=%q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestGenerateAndAttach_FallsBackWhenAPIFails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	t.Setenv("LMSTUDIO_API_URL", srv.URL+"/v1")
	t.Setenv("EMBEDDING_DIMENSION", "16")
	t.Setenv("OPENAI_API_KEY", "")

	out, err := GenerateAndAttach([]string{"hello"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || len(out[0].Embedding) != 16 {
		t.Fatalf("unexpected %#v", out)
	}
}

func TestRetryable(t *testing.T) {
	if !retryable(&httpStatusError{code: 503}) {
		t.Fatal("503 should retry")
	}
	if retryable(&httpStatusError{code: 400}) {
		t.Fatal("400 should not retry")
	}
}
