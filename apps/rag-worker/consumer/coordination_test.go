package consumer

import "testing"

func TestShouldStopIngest_pause(t *testing.T) {
	p := NewProcessor(nil, nil, nil, false, nil)
	p.setPause("doc-1", true)
	if !p.shouldStopIngest("doc-1", 1) {
		t.Fatal("expected pause to stop ingest")
	}
}

func TestShouldStopIngest_deleted(t *testing.T) {
	p := NewProcessor(nil, nil, nil, false, nil)
	p.setDeleted("doc-1", true)
	if !p.shouldStopIngest("doc-1", 1) {
		t.Fatal("expected delete to stop ingest")
	}
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
