package api

import (
	"fmt"
	"strings"

	"apps/rag-worker/models"
)

func labelChunk(hit models.SearchHit) string {
	title := strings.TrimSpace(hit.DocumentTitle)
	if title == "" {
		id := hit.DocumentID
		if len(id) > 8 {
			id = id[:8]
		}
		title = "doc " + id
	}
	return fmt.Sprintf("[%s #%d]", title, hit.ChunkIndex+1)
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
