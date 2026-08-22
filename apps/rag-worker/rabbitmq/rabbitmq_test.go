package rabbitmq

import "testing"

func TestQueueNamesMatchRoutingKeys(t *testing.T) {
	for queue, key := range map[string]string{
		UploadedQueue:  RoutingUploaded,
		DeletedQueue:   RoutingDeleted,
		ProcessedQueue: RoutingProcessed,
		FailedQueue:    RoutingFailed,
	} {
		if queue != key+".queue" {
			t.Fatalf("queue %q should be %q.queue", queue, key)
		}
	}
}
