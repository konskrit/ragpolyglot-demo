package workpool

import (
	"os"
	"runtime"
	"strconv"
)

const (
	defaultRatio        = 0.8
	defaultOCRPageMB    = 80
	defaultEmbedBatchMB = 32
	fallbackMemoryMB    = 2048
)

func cpuSlots() int {
	if v := os.Getenv("WORK_POOL_SLOTS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	n := int(float64(runtime.NumCPU()) * defaultRatio)
	if n < 1 {
		return 1
	}
	return n
}

func memoryBudgetBytes() int64 {
	if v := os.Getenv("WORK_MEMORY_BUDGET_MB"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n * 1024 * 1024
		}
	}
	total := systemMemoryBytes()
	if total <= 0 {
		total = int64(fallbackMemoryMB) * 1024 * 1024
	}
	return int64(float64(total) * defaultRatio)
}

func OCRPageMemory() int64 {
	return taskMemoryMB("OCR_PAGE_MEMORY_MB", defaultOCRPageMB)
}

func EmbedBatchMemory() int64 {
	return taskMemoryMB("EMBED_BATCH_MEMORY_MB", defaultEmbedBatchMB)
}

func taskMemoryMB(envKey string, fallback int) int64 {
	if v := os.Getenv(envKey); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return int64(n) * 1024 * 1024
		}
	}
	return int64(fallback) * 1024 * 1024
}
