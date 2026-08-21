package rabbitmq

import "testing"

func TestJobsTopologyConstants(t *testing.T) {
	if ExchangeName != "system.events" {
		t.Fatalf("exchange=%s", ExchangeName)
	}
	if JobsQueue != "background.jobs.queue" {
		t.Fatalf("queue=%s", JobsQueue)
	}
	if RoutingJobs != "job.#" {
		t.Fatalf("routing=%s", RoutingJobs)
	}
}
