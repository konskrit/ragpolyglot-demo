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
	"document.uploaded.queue":       "documentUploaded",
	"document.deleted.queue":        "documentDeleted",
	"document.pause.queue":          "documentPause",
	"gateway.document-status.queue": "gatewayStatus",
	rmq.JobsQueue:                   "backgroundJobs",
}

type managementQueue struct {
	Name     string `json:"name"`
	Messages int    `json:"messages"`
}

func (r *Runner) fetchQueueDepths(ctx context.Context) map[string]int {
	depths := make(map[string]int, len(queueLabels))
	if strings.TrimSpace(r.rabbitMQManagementURL) == "" {
		return depths
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		strings.TrimRight(r.rabbitMQManagementURL, "/")+"/api/queues",
		nil,
	)
	if err != nil {
		return depths
	}

	res, err := r.httpClient.Do(req)
	if err != nil {
		return depths
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return depths
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return depths
	}

	var queues []managementQueue
	if err := json.Unmarshal(body, &queues); err != nil {
		return depths
	}

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
