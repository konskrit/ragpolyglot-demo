package jobs

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

var watchedQueues = []string{
	"document.uploaded.queue",
	"document.deleted.queue",
	"document.pause.queue",
	"gateway.document-status.queue",
	"background.jobs.queue",
}

type managementQueue struct {
	Name     string `json:"name"`
	Messages int    `json:"messages"`
}

func (r *Runner) fetchQueueDepths(ctx context.Context) map[string]int {
	depths := make(map[string]int, len(watchedQueues))
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

	watched := make(map[string]struct{}, len(watchedQueues))
	for _, name := range watchedQueues {
		watched[name] = struct{}{}
	}

	for _, queue := range queues {
		if _, ok := watched[queue.Name]; ok {
			depths[queue.Name] = queue.Messages
		}
	}

	return depths
}

func normalizeQueueDepths(raw map[string]int) map[string]int {
	labels := map[string]string{
		"document.uploaded.queue":       "documentUploaded",
		"document.deleted.queue":        "documentDeleted",
		"document.pause.queue":          "documentPause",
		"gateway.document-status.queue": "gatewayStatus",
		"background.jobs.queue":         "backgroundJobs",
	}
	out := map[string]int{
		"documentUploaded": 0,
		"documentDeleted":  0,
		"documentPause":    0,
		"gatewayStatus":    0,
		"backgroundJobs":   0,
	}
	for rabbitName, depth := range raw {
		if label, ok := labels[rabbitName]; ok {
			out[label] = depth
		}
	}
	return out
}
