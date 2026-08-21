package jobs

import "testing"

func TestIntFromPayload(t *testing.T) {
	n, ok := intFromPayload(nil, "retentionDays")
	if ok || n != 0 {
		t.Fatalf("nil payload: %v %v", n, ok)
	}

	n, ok = intFromPayload(map[string]any{"retentionDays": 14.0}, "retentionDays")
	if !ok || n != 14 {
		t.Fatalf("float64: %v %v", n, ok)
	}

	n, ok = intFromPayload(map[string]any{"retentionDays": 21}, "retentionDays")
	if !ok || n != 21 {
		t.Fatalf("int: %v %v", n, ok)
	}

	n, ok = intFromPayload(map[string]any{"retentionDays": "30"}, "retentionDays")
	if !ok || n != 30 {
		t.Fatalf("string: %v %v", n, ok)
	}

	_, ok = intFromPayload(map[string]any{"retentionDays": "nope"}, "retentionDays")
	if ok {
		t.Fatal("invalid string should fail")
	}
}

func TestUnknownJob(t *testing.T) {
	err := unknownJobError("made.up")
	if !isUnknownJob(err) {
		t.Fatal("expected unknown job")
	}
	if isUnknownJob(assertError("boom")) {
		t.Fatal("regular error should not match")
	}
}

type assertError string

func (e assertError) Error() string { return string(e) }
