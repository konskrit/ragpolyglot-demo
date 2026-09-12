package api

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"apps/rag-worker/llm"
	"apps/rag-worker/models"
	"apps/rag-worker/summarize"
)

const (
	defaultChatMapContextChars = 8_000
	defaultChatMapMaxTokens    = 2_048
	chatMapSystem              = "You extract evidence for a retrieval-augmented assistant. Use ONLY the excerpts. Do not invent facts."
	chatMapInstruction         = "Extract only facts that help answer the user question. At most 8 short bullets. Keep names, numbers, dates. If nothing is relevant, reply with exactly: NONE"
)

func NormalizeChatMode(mode string) string {
	if strings.EqualFold(strings.TrimSpace(mode), "deep") {
		return "deep"
	}
	return "fast"
}

func chatMapContextChars() int {
	raw := strings.TrimSpace(os.Getenv("RAG_CHAT_MAP_CONTEXT_CHARS"))
	if raw == "" {
		return defaultChatMapContextChars
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 2000 {
		return defaultChatMapContextChars
	}
	return n
}

func chatMapMaxTokens() int {
	raw := strings.TrimSpace(os.Getenv("RAG_CHAT_MAP_MAX_TOKENS"))
	if raw == "" {
		return defaultChatMapMaxTokens
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 256 {
		return defaultChatMapMaxTokens
	}
	return n
}

func chatMapBudget(query string) int {
	maxChars := chatMapContextChars()
	overhead := utf8.RuneCountInString(chatMapSystem) +
		utf8.RuneCountInString(chatMapInstruction) +
		utf8.RuneCountInString(query) +
		utf8.RuneCountInString("\n\nUser question:\n") +
		utf8.RuneCountInString("\n\nExcerpts:\n") +
		32
	b := maxChars - overhead
	if b < 1000 {
		return max(maxChars/2, 1)
	}
	return b
}

func labelSummary(hit models.DocumentSummaryHit) string {
	body := strings.TrimSpace(hit.Content)
	return fmt.Sprintf("[%s · summary]\n%s", docTitle(hit.DocumentTitle, hit.DocumentID), body)
}

func buildSummaryChunks(hits []models.DocumentSummaryHit) []string {
	out := make([]string, 0, len(hits))
	for _, hit := range hits {
		if strings.TrimSpace(hit.Content) == "" {
			continue
		}
		out = append(out, labelSummary(hit))
	}
	return out
}

func uniqueDocumentIDs(hits []models.SearchHit) []string {
	seen := make(map[string]struct{}, len(hits))
	out := make([]string, 0, len(hits))
	for _, hit := range hits {
		id := strings.TrimSpace(hit.DocumentID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func isNoneExtract(s string) bool {
	t := strings.TrimSpace(s)
	if t == "" {
		return true
	}
	t = strings.TrimRight(t, ".!")
	return strings.EqualFold(t, "NONE")
}

type progressFunc func(done, total int) error

func compressEvidence(
	ctx context.Context,
	query string,
	chunks []string,
	onProgress progressFunc,
) ([]string, error) {
	if len(chunks) == 0 {
		return nil, nil
	}
	batches := summarize.PackBatches(chunks, chatMapBudget(query))
	if len(batches) == 0 {
		return nil, nil
	}
	if len(batches) == 1 {
		if onProgress != nil {
			if err := onProgress(1, 1); err != nil {
				return nil, err
			}
		}
		return batches[0], nil
	}

	total := len(batches)
	if onProgress != nil {
		if err := onProgress(0, total); err != nil {
			return nil, err
		}
	}

	out := make([]string, 0, total)
	for i, batch := range batches {
		user := fmt.Sprintf(
			"%s\n\nUser question:\n%s\n\nExcerpts:\n%s",
			chatMapInstruction,
			query,
			strings.Join(batch, "\n\n"),
		)
		text, err := llm.CompleteMax(ctx, chatMapSystem, user, chatMapMaxTokens(), nil)
		if err != nil {
			return nil, fmt.Errorf("chat map batch %d: %w", i+1, err)
		}
		if !isNoneExtract(text) {
			out = append(out, strings.TrimSpace(text))
		}
		if onProgress != nil {
			if err := onProgress(i+1, total); err != nil {
				return nil, err
			}
		}
	}
	if len(out) == 0 {
		flat := make([]string, 0, len(chunks))
		for _, batch := range batches {
			flat = append(flat, batch...)
		}
		return flat, nil
	}
	return out, nil
}

func assembleChatChunks(summaries, evidence []string) []string {
	out := make([]string, 0, len(summaries)+len(evidence))
	out = append(out, summaries...)
	out = append(out, evidence...)
	return out
}

func answerChunks(ctx context.Context, prep *chatPrep, onProgress progressFunc) ([]string, error) {
	if prep.mode != "deep" {
		return prep.evidence, nil
	}
	evidence, err := compressEvidence(ctx, prep.query, prep.evidence, onProgress)
	if err != nil {
		return nil, err
	}
	return assembleChatChunks(prep.summaries, evidence), nil
}
