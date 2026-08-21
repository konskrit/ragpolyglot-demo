package embedding

import (
	"math"
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
	for _, v := range a {
		if math.IsNaN(float64(v)) {
			t.Fatal("NaN in vector")
		}
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
