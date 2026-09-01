package extractor

import (
	"errors"
	"runtime"
	"testing"
	"time"
)

func TestRunCapturePauseKillsProcess(t *testing.T) {
	name, args := sleepArgs()
	stop := false
	go func() {
		time.Sleep(80 * time.Millisecond)
		stop = true
	}()

	start := time.Now()
	_, err := runCapture(func() bool { return stop }, name, args...)
	elapsed := time.Since(start)
	if !errors.Is(err, ErrPaused) {
		t.Fatalf("got %v", err)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("pause took %s, want process killed quickly", elapsed)
	}
}

func TestLockKrakenGPUHonorsPause(t *testing.T) {
	krakenGPUMu.Lock()
	defer krakenGPUMu.Unlock()

	err := lockKrakenGPU(func() bool { return true })
	if !errors.Is(err, ErrPaused) {
		t.Fatalf("got %v", err)
	}
}

func sleepArgs() (string, []string) {
	if runtime.GOOS == "windows" {
		return "ping", []string{"-n", "20", "127.0.0.1"}
	}
	return "sleep", []string{"20"}
}
