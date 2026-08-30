package workpool

import (
	"sync/atomic"
	"testing"
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

func TestOCRPageMemoryOverride(t *testing.T) {
	t.Setenv("OCR_PAGE_MEMORY_MB", "10")
	if got := OCRPageMemory(); got != 10*1024*1024 {
		t.Fatalf("got %d", got)
	}
}
