package summarize

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"apps/rag-worker/embedding"
	"apps/rag-worker/llm"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
)

const (
	SummaryChunkIndex          = -1
	defaultSummaryContextChars = 20_000
	summarySystem              = "You are a careful document summarizer. Preserve key claims, names, dates, and structure. Do not invent facts."
	summaryMapInstruction      = "Summarize the following document excerpts. Keep important details; write in the same language as the source when clear."
	summaryReduceInstruction   = "Combine these partial summaries into one coherent document summary. Keep important details; avoid repetition."
)

type ProgressFunc func(done, total int) error
type ShouldStopFunc func() bool

func ContextChars(override int) int {
	if override >= 2000 {
		return override
	}
	return summaryContextChars()
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

func sourceBudget(maxChars int, instruction string) int {
	overhead := utf8.RuneCountInString(summarySystem) + utf8.RuneCountInString(instruction) + 64
	b := maxChars - overhead
	if b < 1000 {
		return max(maxChars/2, 1)
	}
	return b
}

func PackBatches(texts []string, maxChars int) [][]string {
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

// Run map-reduce with checkpoints. paused=true means cooperative stop.
// Map resumes by batch index. Reduce only checkpoints between full rounds
// (mid-round pause restarts that round from saved partials).
func Run(
	ctx context.Context,
	store *storage.Store,
	documentID string,
	texts []string,
	contextChars int,
	reset bool,
	allowFallback bool,
	shouldStop ShouldStopFunc,
	onProgress ProgressFunc,
) (paused bool, err error) {
	storeCtx := context.Background()

	if reset {
		if err := store.DeleteSummarizeCheckpoint(storeCtx, documentID); err != nil {
			return false, err
		}
	}

	cp, err := store.GetSummarizeCheckpoint(storeCtx, documentID)
	if err != nil {
		return false, err
	}
	if cp != nil && cp.ContextChars >= 2000 {
		contextChars = cp.ContextChars
	}

	batches := PackBatches(texts, sourceBudget(contextChars, summaryMapInstruction))
	if len(batches) == 0 {
		return false, fmt.Errorf("no text to summarize")
	}

	if cp == nil {
		cp = &storage.SummarizeCheckpoint{
			DocumentID:   documentID,
			Stage:        "map",
			Done:         0,
			Total:        len(batches),
			Partials:     []string{},
			ContextChars: contextChars,
		}
	} else if cp.Stage == "map" {
		cp.Total = len(batches)
		cp.ContextChars = contextChars
	}

	save := func() error { return store.UpsertSummarizeCheckpoint(storeCtx, *cp) }

	if err := onProgress(cp.Done, max(cp.Total, 1)); err != nil {
		return false, err
	}

	if cp.Stage == "map" {
		for i := cp.Done; i < len(batches); i++ {
			if shouldStop() {
				_ = save()
				return true, nil
			}
			user := fmt.Sprintf("%s\n\n---\n\n%s", summaryMapInstruction, strings.Join(batches[i], "\n\n"))
			out, callErr := llm.Complete(ctx, summarySystem, user, nil)
			if callErr != nil {
				_ = save()
				if shouldStop() || errors.Is(callErr, context.Canceled) {
					return true, nil
				}
				return false, fmt.Errorf("map batch %d: %w", i+1, callErr)
			}
			cp.Partials = append(cp.Partials, out)
			cp.Done = i + 1
			if err := save(); err != nil {
				return false, err
			}
			if err := onProgress(cp.Done, cp.Total); err != nil {
				return false, err
			}
		}
		cp.Stage = "reduce"
		cp.Done = 0
		cp.Total = max(len(cp.Partials), 1)
		if err := save(); err != nil {
			return false, err
		}
	}

	partials := append([]string(nil), cp.Partials...)
	reduceBudget := sourceBudget(contextChars, summaryReduceInstruction)

	for len(partials) > 1 {
		if shouldStop() {
			cp.Partials = partials
			cp.Done = 0
			cp.Total = max(len(partials), 1)
			_ = save()
			return true, nil
		}

		nextBatches := PackBatches(partials, reduceBudget)
		next := make([]string, 0, len(nextBatches))
		for i, batch := range nextBatches {
			if shouldStop() {
				cp.Partials = partials
				cp.Done = 0
				cp.Total = max(len(partials), 1)
				_ = save()
				return true, nil
			}
			user := fmt.Sprintf("%s\n\n---\n\n%s", summaryReduceInstruction, strings.Join(batch, "\n\n"))
			out, callErr := llm.Complete(ctx, summarySystem, user, nil)
			if callErr != nil {
				cp.Partials = partials
				cp.Done = 0
				cp.Total = max(len(partials), 1)
				_ = save()
				if shouldStop() || errors.Is(callErr, context.Canceled) {
					return true, nil
				}
				return false, fmt.Errorf("reduce batch %d: %w", i+1, callErr)
			}
			next = append(next, out)
			if err := onProgress(len(next), max(len(nextBatches), 1)); err != nil {
				return false, err
			}
		}
		partials = next
		cp.Partials = partials
		cp.Done = 0
		cp.Total = max(len(partials), 1)
		if err := save(); err != nil {
			return false, err
		}
	}

	if len(partials) == 0 {
		return false, fmt.Errorf("empty summary")
	}
	if err := persistSummary(storeCtx, store, documentID, strings.TrimSpace(partials[0]), allowFallback); err != nil {
		return false, err
	}
	if err := store.DeleteSummarizeCheckpoint(storeCtx, documentID); err != nil {
		return false, err
	}
	return false, nil
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
