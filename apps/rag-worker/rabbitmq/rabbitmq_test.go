package rabbitmq

import "testing"

func TestDocumentTopologyConstants(t *testing.T) {
	if ExchangeName != "document.events" {
		t.Fatalf("exchange=%s", ExchangeName)
	}

	want := map[string]string{
		UploadedQueue:  RoutingUploaded,
		DeletedQueue:   RoutingDeleted,
		ProcessedQueue: RoutingProcessed,
		FailedQueue:    RoutingFailed,
	}

	if len(want) != 4 {
		t.Fatal("expected 4 queue bindings")
	}

	for queue, key := range want {
		if queue == "" || key == "" {
			t.Fatalf("empty queue/key: %q -> %q", queue, key)
		}
		if queue != key+".queue" {
			t.Fatalf("queue %q should be %q.queue", queue, key)
		}
	}
}
