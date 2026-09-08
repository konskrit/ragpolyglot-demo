package extractor

import (
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

func TestIsTransientOCRAbort(t *testing.T) {
	if IsTransientOCRAbort(ErrPaused) {
		t.Fatal("pause must not look like a transient abort")
	}
	if !IsTransientOCRAbort(fmt.Errorf("kraken failed: signal: killed")) {
		t.Fatal("signal killed should retry")
	}
	if !IsTransientOCRAbort(fmt.Errorf("kraken failed: exit status 137")) {
		t.Fatal("exit 137 should retry")
	}
	if IsTransientOCRAbort(fmt.Errorf("kraken failed: ocr failed")) {
		t.Fatal("ordinary error should not retry")
	}
}

func sleepArgs() (string, []string) {
	if runtime.GOOS == "windows" {
		return "ping", []string{"-n", "20", "127.0.0.1"}
	}
	return "sleep", []string{"20"}
}
