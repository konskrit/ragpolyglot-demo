package publisher

import "testing"

func TestConnected_false_without_channel(t *testing.T) {
	var pub Publisher
	if pub.Connected() {
		t.Fatal("expected publisher to be disconnected without a channel")
	}
}
