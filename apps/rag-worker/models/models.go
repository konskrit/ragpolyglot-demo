package models

// Internal / storage-only types (not part of libs/contracts wire schema).
// Wire events and HTTP DTOs: wire_gen.go (npm run contracts:gen).

type DocumentChunk struct {
	DocumentID string
	ChunkIndex int
	Content    string
	Embedding  []float32
}

type TextChunk struct {
	Text      string
	Embedding []float32
}

type DocumentSummaryHit struct {
	DocumentID    string
	DocumentTitle string
	Content       string
}
