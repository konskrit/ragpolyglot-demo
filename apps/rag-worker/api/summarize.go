package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"apps/rag-worker/embedding"
	"apps/rag-worker/llm"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
)

// SummaryChunkIndex is reserved for the persisted document summary (RAG-searchable).
// Content chunks use 0..n-1; UI lists exclude negative indices.
const SummaryChunkIndex = -1

const (
	defaultSummaryContextChars = 60_000
	summarySystem              = "You are a careful document summarizer. Preserve key claims, names, dates, and structure. Do not invent facts."
	summaryMapInstruction      = "Summarize the following document excerpts. Keep important details; write in the same language as the source when clear."
	summaryReduceInstruction   = "Combine these partial summaries into one coherent document summary. Keep important details; avoid repetition."
)

func (s *Server) summarize(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	var req models.SummarizeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	documentID := strings.ToLower(strings.TrimSpace(req.DocumentID))
	if !isUUID(documentID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "documentId is required"})
		return
	}

	persist := true
	if req.Persist != nil {
		persist = *req.Persist
	}
	contextChars := resolveSummaryContextChars(req.MaxContextChars)

	texts, err := s.store.ListChunkTexts(ctx, documentID)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("[API] summarize list chunks failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load chunks"})
		return
	}
	if len(texts) == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no chunks for document"})
		return
	}

	batches := packBatches(texts, sourceBudget(contextChars, summaryMapInstruction))
	summary, calls, err := summarizeBatches(ctx, batches, contextChars)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("[API] summarize failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "summarization failed"})
		return
	}

	persisted := false
	if persist {
		if err := persistSummary(ctx, s.store, documentID, summary, s.allowFallback); err != nil {
			log.Printf("[API] summarize persist failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "summary generated but persist failed"})
			return
		}
		persisted = true
	}

	duration := time.Since(start)
	s.store.LogSystem(ctx, "doc_summarize", documentID, duration, map[string]any{
		"batchCount":   len(batches),
		"llmCalls":     calls,
		"contextChars": contextChars,
		"persisted":    persisted,
		"chunkCount":   len(texts),
	})

	writeJSON(w, http.StatusOK, models.SummarizeResponse{
		DocumentID:   documentID,
		Summary:      summary,
		BatchCount:   len(batches),
		LLMCalls:     calls,
		Persisted:    persisted,
		ContextChars: contextChars,
	})
}

func summaryContextChars() int {
	raw := strings.TrimSpace(os.Getenv("RAG_SUMMARY_CONTEXT_CHARS"))
	if raw == "" {
		return defaultSummaryContextChars
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 2000 {
		return defaultSummaryContextChars
	}
	return n
}

func resolveSummaryContextChars(override int) int {
	if override >= 2000 {
		return override
	}
	return summaryContextChars()
}

// sourceBudget leaves room for system + instruction text inside the configured window.
func sourceBudget(maxChars int, instruction string) int {
	overhead := utf8.RuneCountInString(summarySystem) + utf8.RuneCountInString(instruction) + 64
	b := maxChars - overhead
	if b < 1000 {
		return max(maxChars/2, 1)
	}
	return b
}

// packBatches groups texts so each batch's joined size stays under maxChars (runes).
func packBatches(texts []string, maxChars int) [][]string {
	if maxChars < 1 {
		maxChars = defaultSummaryContextChars
	}
	var batches [][]string
	var cur []string
	used := 0
	for _, t := range texts {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		n := utf8.RuneCountInString(t)
		if n > maxChars {
			if len(cur) > 0 {
				batches = append(batches, cur)
				cur = nil
				used = 0
			}
			runes := []rune(t)
			batches = append(batches, []string{string(runes[:maxChars])})
			continue
		}
		sep := 0
		if len(cur) > 0 {
			sep = 2
		}
		if used+sep+n > maxChars && len(cur) > 0 {
			batches = append(batches, cur)
			cur = []string{t}
			used = n
			continue
		}
		cur = append(cur, t)
		used += sep + n
	}
	if len(cur) > 0 {
		batches = append(batches, cur)
	}
	return batches
}

func summarizeBatches(ctx context.Context, batches [][]string, maxChars int) (string, int, error) {
	if len(batches) == 0 {
		return "", 0, fmt.Errorf("no text to summarize")
	}

	calls := 0
	partials := make([]string, 0, len(batches))
	for i, batch := range batches {
		user := fmt.Sprintf("%s\n\n---\n\n%s", summaryMapInstruction, strings.Join(batch, "\n\n"))
		out, err := llm.Complete(ctx, summarySystem, user, nil)
		calls++
		if err != nil {
			return "", calls, fmt.Errorf("map batch %d: %w", i+1, err)
		}
		partials = append(partials, out)
	}

	reduceBudget := sourceBudget(maxChars, summaryReduceInstruction)
	for len(partials) > 1 {
		nextBatches := packBatches(partials, reduceBudget)
		partials = partials[:0]
		for i, batch := range nextBatches {
			user := fmt.Sprintf("%s\n\n---\n\n%s", summaryReduceInstruction, strings.Join(batch, "\n\n"))
			out, err := llm.Complete(ctx, summarySystem, user, nil)
			calls++
			if err != nil {
				return "", calls, fmt.Errorf("reduce batch %d: %w", i+1, err)
			}
			partials = append(partials, out)
		}
	}
	return partials[0], calls, nil
}

func persistSummary(
	ctx context.Context,
	store *storage.Store,
	documentID, summary string,
	allowFallback bool,
) error {
	labeled := "[Document summary]\n" + strings.TrimSpace(summary)
	chunks, err := embedding.GenerateAndAttach([]string{labeled}, allowFallback)
	if err != nil {
		return err
	}
	return store.UpsertChunk(ctx, models.DocumentChunk{
		DocumentID: documentID,
		ChunkIndex: SummaryChunkIndex,
		Content:    labeled,
		Embedding:  chunks[0].Embedding,
	})
}
