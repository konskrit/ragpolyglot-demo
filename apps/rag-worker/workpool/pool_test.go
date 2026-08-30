package workpool

import (
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestPoolLimitsConcurrency(t *testing.T) {
	t.Setenv("WORK_POOL_SLOTS", "2")
	t.Setenv("WORK_MEMORY_BUDGET_MB", "256")
	t.Setenv("OCR_PAGE_MEMORY_MB", "64")
	t.Setenv("EMBED_BATCH_MEMORY_MB", "32")

	p := New()
	if p.Slots() != 2 {
		t.Fatalf("slots=%d want 2", p.Slots())
	}

	mem := OCRPageMemory()
	done := make(chan struct{}, 4)
	var running atomic.Int32
	var peak atomic.Int32

	for range 4 {
		go func() {
			_ = p.Run(mem, func() error {
				n := running.Add(1)
				for {
					old := peak.Load()
					if n <= old || peak.CompareAndSwap(old, n) {
						break
					}
				}
				running.Add(-1)
				done <- struct{}{}
				return nil
			})
		}()
	}

	for range 4 {
		<-done
	}
	if peak.Load() > 2 {
		t.Fatalf("peak concurrent=%d want <=2", peak.Load())
	}
}

func TestRunWhileStopWhileWaiting(t *testing.T) {
	t.Setenv("WORK_POOL_SLOTS", "1")
	t.Setenv("WORK_MEMORY_BUDGET_MB", "256")
	t.Setenv("OCR_PAGE_MEMORY_MB", "64")

	p := New()
	mem := OCRPageMemory()
	block := make(chan struct{})

	go func() {
		_ = p.Run(mem, func() error {
			<-block
			return nil
		})
	}()

	time.Sleep(50 * time.Millisecond)

	stop := false
	done := make(chan error, 1)
	go func() {
		done <- p.RunWhile(mem, func() bool { return stop }, func() error { return nil })
	}()

	select {
	case err := <-done:
		t.Fatalf("expected to block, got %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	stop = true

	select {
	case err := <-done:
		if !errors.Is(err, ErrStopped) {
			t.Fatalf("got %v want ErrStopped", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for stop")
	}

	close(block)
}

func TestRabbitPrefetch(t *testing.T) {
	t.Setenv("FAST_INGEST_PREFETCH", "3")
	t.Setenv("OCR_INGEST_PREFETCH", "2")
	if got := RabbitPrefetch(); got != 5 {
		t.Fatalf("got %d want 5", got)
	}
	t.Setenv("FAST_INGEST_PREFETCH", "")
	t.Setenv("OCR_INGEST_PREFETCH", "")
	t.Setenv("INGEST_PREFETCH", "3")
	if got := OCRIngestPrefetch(); got != 3 {
		t.Fatalf("ocr ingest got %d want 3", got)
	}
	if got := RabbitPrefetch(); got != defaultFastIngestPrefetch+3 {
		t.Fatalf("rabbit got %d want %d", got, defaultFastIngestPrefetch+3)
	}
}

func TestPoolCPUratio(t *testing.T) {
	t.Setenv("WORK_POOL_CPU_RATIO", "0.5")
	if got := poolCPUratio(); got != 0.5 {
		t.Fatalf("got %v want 0.5", got)
	}
	t.Setenv("WORK_POOL_CPU_RATIO", "")
	if got := poolCPUratio(); got != defaultRatio {
		t.Fatalf("got %v want %v", got, defaultRatio)
	}
}

func TestOCRPageMemoryOverride(t *testing.T) {
	t.Setenv("OCR_PAGE_MEMORY_MB", "10")
	if got := OCRPageMemory(); got != 10*1024*1024 {
		t.Fatalf("got %d", got)
	}
}
