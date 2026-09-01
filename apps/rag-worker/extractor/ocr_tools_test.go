package extractor

import (
	"context"
	"errors"
	"fmt"
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

func TestAcquireKrakenGPUHonorsPause(t *testing.T) {
	resetKrakenGPUSemForTest(t)
	t.Setenv("KRAKEN_GPU_CONCURRENT", "1")
	sem := initKrakenGPUSem()
	sem <- struct{}{}

	err := acquireKrakenGPU(func() bool { return true })
	if !errors.Is(err, ErrPaused) {
		t.Fatalf("got %v", err)
	}
}

func TestIsProcessAbort(t *testing.T) {
	if !IsProcessAbort(context.Canceled) {
		t.Fatal("context.Canceled should abort")
	}
	if !IsProcessAbort(fmt.Errorf("kraken failed: signal: killed")) {
		t.Fatal("signal killed should abort")
	}
	if IsProcessAbort(fmt.Errorf("kraken failed: ocr failed")) {
		t.Fatal("ordinary error should not abort")
	}
}

func sleepArgs() (string, []string) {
	if runtime.GOOS == "windows" {
		return "ping", []string{"-n", "20", "127.0.0.1"}
	}
	return "sleep", []string{"20"}
}
