package consumer

import (
	"errors"
	"testing"
)

func TestPublishWithRetry_succeedsFirstAttempt(t *testing.T) {
	calls := 0
	err := publishWithRetry("test", func() error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 1 {
		t.Fatalf("calls=%d want 1", calls)
	}
}

func TestPublishWithRetry_retriesThenSucceeds(t *testing.T) {
	calls := 0
	err := publishWithRetry("test", func() error {
		calls++
		if calls < 3 {
			return errors.New("transient")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 3 {
		t.Fatalf("calls=%d want 3", calls)
	}
}

func TestPublishWithRetry_exhaustsAttempts(t *testing.T) {
	calls := 0
	err := publishWithRetry("test", func() error {
		calls++
		return errors.New("persistent")
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if calls != publishMaxAttempts {
		t.Fatalf("calls=%d want %d", calls, publishMaxAttempts)
	}
}
