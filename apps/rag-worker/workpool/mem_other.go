//go:build !linux

package workpool

func systemMemoryBytes() int64 {
	return 0
}
