package models

import (
	"encoding/json"
	"testing"
)

func TestDocumentSummarizeEvent_MaxContextCharsNull(t *testing.T) {
	const raw = `{"type":"document.summarize","documentId":"abc","maxContextChars":null,"reset":true}`
	var event DocumentSummarizeEvent
	if err := json.Unmarshal([]byte(raw), &event); err != nil {
		t.Fatalf("null maxContextChars should unmarshal: %v", err)
	}
	if event.DocumentID != "abc" || !event.Reset {
		t.Fatalf("got %+v", event)
	}
	if event.MaxContextChars != nil {
		t.Fatalf("want nil pointer, got %v", *event.MaxContextChars)
	}
}

func TestDocumentSummarizeEvent_MaxContextCharsOmitted(t *testing.T) {
	const raw = `{"type":"document.summarize","documentId":"abc"}`
	var event DocumentSummarizeEvent
	if err := json.Unmarshal([]byte(raw), &event); err != nil {
		t.Fatalf("omitted maxContextChars should unmarshal: %v", err)
	}
	if event.MaxContextChars != nil {
		t.Fatalf("want nil pointer, got %v", *event.MaxContextChars)
	}
}

func TestDocumentSummarizeEvent_MaxContextCharsSet(t *testing.T) {
	const raw = `{"documentId":"abc","maxContextChars":8000}`
	var event DocumentSummarizeEvent
	if err := json.Unmarshal([]byte(raw), &event); err != nil {
		t.Fatalf("set maxContextChars should unmarshal: %v", err)
	}
	if event.MaxContextChars == nil || *event.MaxContextChars != 8000 {
		t.Fatalf("want 8000, got %+v", event.MaxContextChars)
	}
}
