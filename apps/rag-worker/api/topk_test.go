package api

import "testing"

func TestClampTopK(t *testing.T) {
	cases := []struct {
		in, def, want int
	}{
		{0, 5, 5},
		{1, 5, 5},
		{7, 5, 7},
		{10, 5, 10},
		{99, 5, 10},
	}
	for _, tc := range cases {
		if got := ClampTopK(tc.in, tc.def); got != tc.want {
			t.Fatalf("ClampTopK(%d,%d)=%d want %d", tc.in, tc.def, got, tc.want)
		}
	}
}

func TestClampChatTopK(t *testing.T) {
	cases := []struct {
		in, def, want int
	}{
		{0, 20, 20},
		{5, 20, 10},
		{15, 20, 15},
		{40, 20, 40},
		{99, 20, 40},
	}
	for _, tc := range cases {
		if got := ClampChatTopK(tc.in, tc.def); got != tc.want {
			t.Fatalf("ClampChatTopK(%d,%d)=%d want %d", tc.in, tc.def, got, tc.want)
		}
	}
}
