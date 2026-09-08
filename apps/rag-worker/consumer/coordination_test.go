package consumer

import (
	"testing"
	"time"
)

func TestShouldStopIngest_pause(t *testing.T) {
	p := NewProcessor(nil, nil, nil, false, nil)
	p.setPause("doc-1", true)
	if !p.shouldStopIngest("doc-1", 1) {
		t.Fatal("expected pause to stop ingest")
	}
}

func TestWaitChanSlot_stopsWithoutTakingSlot(t *testing.T) {
	ch := make(chan struct{}, 1)
	ch <- struct{}{}
	err := waitChanSlot(ch, func() bool { return true })
	if err == nil {
		t.Fatal("expected pause while waiting for a full channel")
	}
	if len(ch) != 1 {
		t.Fatalf("slot taken on pause, len=%d", len(ch))
	}
}

func TestShouldStopIngest_deleted(t *testing.T) {
	p := NewProcessor(nil, nil, nil, false, nil)
	p.setDeleted("doc-1", true)
	if !p.shouldStopIngest("doc-1", 1) {
		t.Fatal("expected delete to stop ingest")
	}
}

func TestAcquireOCRIngestSlot(t *testing.T) {
	p := NewProcessor(nil, nil, nil, false, nil)
	p.ocrIngestSem = make(chan struct{}, 1)

	release, err := p.acquireOCRIngestSlot(nil, nil)
	if err != nil || release == nil {
		t.Fatalf("expected slot, err=%v", err)
	}
	stopped := false
	done := make(chan error, 1)
	go func() {
		_, err := p.acquireOCRIngestSlot(func() bool { return stopped }, nil)
		done <- err
	}()
	time.Sleep(slotWaitPoll * 2)
	stopped = true
	if err := <-done; err == nil {
		t.Fatal("expected pause while waiting")
	}
	release()
}

func TestIsIngestStale_localGen(t *testing.T) {
	p := NewProcessor(nil, nil, nil, false, nil)
	gen := p.nextIngestGen("doc-1")
	if p.isIngestStale("doc-1", gen) {
		t.Fatal("expected current generation to be active")
	}
	p.nextIngestGen("doc-1")
	if !p.isIngestStale("doc-1", gen) {
		t.Fatal("expected bumped generation to invalidate prior ingest")
	}
}
