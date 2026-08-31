package jobs

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNormalizeQueueDepths(t *testing.T) {
	raw := map[string]int{
		"document.uploaded.queue":       3,
		"gateway.document-status.queue": 1,
	}
	got := normalizeQueueDepths(raw)
	if got["documentUploaded"] != 3 || got["gatewayStatus"] != 1 {
		t.Fatalf("unexpected depths: %#v", got)
	}
}

func TestFetchQueueDepths(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/queues" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode([]managementQueue{
			{Name: "document.uploaded.queue", Messages: 4},
			{Name: "other.queue", Messages: 99},
		})
	}))
	defer server.Close()

	runner := &Runner{
		rabbitMQManagementURL: server.URL,
		httpClient:            server.Client(),
	}
	depths := runner.fetchQueueDepths(context.Background())
	if depths["document.uploaded.queue"] != 4 {
		t.Fatalf("got %#v", depths)
	}
	if _, ok := depths["other.queue"]; ok {
		t.Fatal("unexpected queue included")
	}
}
