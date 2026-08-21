package models

import "time"

type DocumentUploadedEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	FilePath   string    `json:"filePath"`
	UserID     string    `json:"userId"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentDeletedEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentProcessedEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	ChunkCount int       `json:"chunkCount"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentFailedEvent struct {
	Type        string    `json:"type"`
	DocumentID  string    `json:"documentId"`
	ErrorReason string    `json:"errorReason"`
	Timestamp   time.Time `json:"timestamp"`
}

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

type SearchRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"topK"`
}

type SearchHit struct {
	DocumentID string  `json:"documentId"`
	ChunkIndex int     `json:"chunkIndex"`
	Content    string  `json:"content"`
	Similarity float64 `json:"similarity"`
}

type SearchResponse struct {
	Query   string      `json:"query"`
	TopK    int         `json:"topK"`
	Results []SearchHit `json:"results"`
}
