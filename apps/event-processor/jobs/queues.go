package jobs

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	rmq "apps/event-processor/rabbitmq"
)

var queueLabels = map[string]string{
	"document.uploaded.queue":            "documentUploaded",
	"document.deleted.queue":             "documentDeleted",
	"document.pause.queue":               "documentPause",
	"document.processed.queue":           "documentProcessed",
	"document.failed.queue":              "documentFailed",
	"document.paused.queue":              "documentPaused",
	"document.progress.queue":            "documentProgress",
	"document.summarize.queue":           "documentSummarize",
	"document.summarize.pause.queue":     "documentSummarizePause",
	"document.summarize.progress.queue":  "documentSummarizeProgress",
	"document.summarize.completed.queue": "documentSummarizeCompleted",
	"document.summarize.failed.queue":    "documentSummarizeFailed",
	"document.summarize.paused.queue":    "documentSummarizePaused",
	"gateway.document-status.queue":      "gatewayStatus",
	rmq.JobsQueue:                        "backgroundJobs",
}

type managementQueue struct {
	Name     string `json:"name"`
	Messages int    `json:"messages"`
}

// Returns nil when depths are unreadable, so a broker outage is not reported as
// a set of empty queues.
func (r *Runner) fetchQueueDepths(ctx context.Context) map[string]int {
	if strings.TrimSpace(r.rabbitMQManagementURL) == "" {
		return nil
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		strings.TrimRight(r.rabbitMQManagementURL, "/")+"/api/queues",
		nil,
	)
	if err != nil {
		return nil
	}

	res, err := r.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil
	}

	var queues []managementQueue
	if err := json.Unmarshal(body, &queues); err != nil {
		return nil
	}

	depths := make(map[string]int, len(queueLabels))
	for _, queue := range queues {
		if _, ok := queueLabels[queue.Name]; ok {
			depths[queue.Name] = queue.Messages
		}
	}

	return depths
}

func normalizeQueueDepths(raw map[string]int) map[string]int {
	out := make(map[string]int, len(queueLabels))
	for name, label := range queueLabels {
		out[label] = raw[name]
	}
	return out
}
