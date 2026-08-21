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
