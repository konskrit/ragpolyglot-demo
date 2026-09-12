package api

import (
	"fmt"
	"strings"

	"apps/rag-worker/models"
)

func docTitle(title, documentID string) string {
	title = strings.TrimSpace(title)
	if title != "" {
		return title
	}
	id := documentID
	if len(id) > 8 {
		id = id[:8]
	}
	return "doc " + id
}

func labelChunk(hit models.SearchHit) string {
	return fmt.Sprintf("[%s #%d]", docTitle(hit.DocumentTitle, hit.DocumentID), hit.ChunkIndex+1)
}

// buildContextChunks labels hits for the LLM prompt. Hits themselves are unchanged for client sources.
func buildContextChunks(hits []models.SearchHit) []string {
	out := make([]string, 0, len(hits))
	for _, hit := range hits {
		body := strings.TrimSpace(hit.Content)
		if body == "" {
			continue
		}
		out = append(out, labelChunk(hit)+"\n"+body)
	}
	return out
}
