package models

import "time"

type DocumentUploadedEvent struct {
	Type        string    `json:"type"`
	DocumentID  string    `json:"documentId"`
	FilePath    string    `json:"filePath"`
	UserID      string    `json:"userId"`
	OcrLang     string    `json:"ocrLang,omitempty"`
	Retry       bool      `json:"retry,omitempty"`
	ResetIngest bool      `json:"resetIngest,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
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
	OcrLang    string    `json:"ocrLang,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentFailedEvent struct {
	Type        string    `json:"type"`
	DocumentID  string    `json:"documentId"`
	ErrorReason string    `json:"errorReason"`
	Timestamp   time.Time `json:"timestamp"`
}

type DocumentPauseEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentPausedEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentProgressEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Stage      string    `json:"stage"`
	Done       int       `json:"done"`
	Total      int       `json:"total"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentSummarizeEvent struct {
	Type            string    `json:"type"`
	DocumentID      string    `json:"documentId"`
	MaxContextChars int       `json:"maxContextChars,omitempty"`
	Reset           bool      `json:"reset,omitempty"`
	Timestamp       time.Time `json:"timestamp"`
}

type DocumentSummarizePauseEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentSummarizeProgressEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Done       int       `json:"done"`
	Total      int       `json:"total"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentSummarizeCompletedEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Timestamp  time.Time `json:"timestamp"`
}

type DocumentSummarizeFailedEvent struct {
	Type        string    `json:"type"`
	DocumentID  string    `json:"documentId"`
	ErrorReason string    `json:"errorReason"`
	Timestamp   time.Time `json:"timestamp"`
}

type DocumentSummarizePausedEvent struct {
	Type       string    `json:"type"`
	DocumentID string    `json:"documentId"`
	Timestamp  time.Time `json:"timestamp"`
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
	Query       string   `json:"query"`
	TopK        int      `json:"topK"`
	DocumentIDs []string `json:"documentIds,omitempty"`
}

type SearchHit struct {
	DocumentID    string  `json:"documentId"`
	DocumentTitle string  `json:"documentTitle,omitempty"`
	ChunkIndex    int     `json:"chunkIndex"`
	Content       string  `json:"content"`
	Similarity    float64 `json:"similarity"`
}

type DocumentSummaryHit struct {
	DocumentID    string
	DocumentTitle string
	Content       string
}

type SearchResponse struct {
	Query   string      `json:"query"`
	TopK    int         `json:"topK"`
	Results []SearchHit `json:"results"`
}

type ChatRequest struct {
	Query       string   `json:"query"`
	TopK        int      `json:"topK"`
	Mode        string   `json:"mode,omitempty"`
	DocumentIDs []string `json:"documentIds,omitempty"`
}

type ChatResponse struct {
	Query   string      `json:"query"`
	TopK    int         `json:"topK"`
	Answer  string      `json:"answer"`
	Sources []SearchHit `json:"sources"`
}

// NDJSON events for POST /api/chat/stream
type ChatStreamTokenEvent struct {
	Type  string `json:"type"`
	Token string `json:"token"`
}

type ChatStreamProgressEvent struct {
	Type  string `json:"type"`
	Done  int    `json:"done"`
	Total int    `json:"total"`
}

type ChatStreamDoneEvent struct {
	Type    string      `json:"type"`
	Query   string      `json:"query"`
	TopK    int         `json:"topK"`
	Answer  string      `json:"answer"`
	Sources []SearchHit `json:"sources"`
}

type ChatStreamErrorEvent struct {
	Type  string `json:"type"`
	Error string `json:"error"`
}
