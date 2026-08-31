package publisher

import "testing"

func TestNew_not_connected_without_channel(t *testing.T) {
	pub := New(nil)
	if pub.Connected() {
		t.Fatal("expected publisher to be disconnected without a channel")
	}
}
