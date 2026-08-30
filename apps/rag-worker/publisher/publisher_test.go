package publisher

import "testing"

func TestNew_not_connected_before_first_publish(t *testing.T) {
	pub := New("amqp://guest:guest@127.0.0.1:9")
	if pub.Connected() {
		t.Fatal("expected publisher to be disconnected before first publish")
	}
}
