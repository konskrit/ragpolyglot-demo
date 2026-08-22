package jobs

import (
	"errors"
	"fmt"
	"testing"
)

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
	err := fmt.Errorf("%w: made.up", errUnknownJob)
	if !errors.Is(err, errUnknownJob) {
		t.Fatal("expected unknown job")
	}
	if errors.Is(errors.New("boom"), errUnknownJob) {
		t.Fatal("regular error should not match")
	}
}

func TestInfoInt(t *testing.T) {
	info := "# Memory\r\nused_memory:1048576\r\nused_memory_peak:2097152\r\n"
	used, ok := infoInt(info, "used_memory")
	if !ok || used != 1048576 {
		t.Fatalf("used_memory: %v %v", used, ok)
	}
	peak, ok := infoInt(info, "used_memory_peak")
	if !ok || peak != 2097152 {
		t.Fatalf("used_memory_peak: %v %v", peak, ok)
	}
	_, ok = infoInt(info, "missing")
	if ok {
		t.Fatal("missing key should fail")
	}
}

func TestLockKey(t *testing.T) {
	if got := lockKey("abc"); got != "job:abc:processing" {
		t.Fatalf("lockKey=%s", got)
	}
}
