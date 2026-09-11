package api

import "testing"

func TestPackBatchesRespectsLimit(t *testing.T) {
	batches := packBatches([]string{"aaa", "bbb", "ccc"}, 8)
	if len(batches) != 2 {
		t.Fatalf("got %d batches: %#v", len(batches), batches)
	}
	if got := len(batches[0]); got != 2 {
		t.Fatalf("first batch size=%d %#v", got, batches[0])
	}
	if got := len(batches[1]); got != 1 || batches[1][0] != "ccc" {
		t.Fatalf("second batch %#v", batches[1])
	}
}

func TestPackBatchesSingleFits(t *testing.T) {
	batches := packBatches([]string{"hello", "world"}, 100)
	if len(batches) != 1 || len(batches[0]) != 2 {
		t.Fatalf("got %#v", batches)
	}
}

func TestPackBatchesSkipsEmpty(t *testing.T) {
	batches := packBatches([]string{" ", "x", ""}, 100)
	if len(batches) != 1 || batches[0][0] != "x" {
		t.Fatalf("got %#v", batches)
	}
}
