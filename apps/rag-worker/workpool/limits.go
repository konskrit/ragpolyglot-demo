package workpool

import (
	"os"
	"runtime"
	"strconv"
)

const (
	defaultRatio              = 0.8
	defaultOCRPageMB          = 64
	defaultEmbedBatchMB       = 32
	defaultFastIngestPrefetch = 4
	defaultOCRIngestPrefetch  = 1
	defaultEmbedPoolSlots     = 2
	fallbackMemoryMB          = 2048
)

func poolCPUratio() float64 {
	if v := os.Getenv("WORK_POOL_CPU_RATIO"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 && f <= 1 {
			return f
		}
	}
	return defaultRatio
}

func cpuSlots() int {
	if v := os.Getenv("WORK_POOL_SLOTS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	n := int(float64(runtime.NumCPU()) * poolCPUratio())
	if n < 1 {
		return 1
	}
	return n
}

func OCRPoolSlots() int {
	if v := os.Getenv("OCR_POOL_SLOTS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return cpuSlots()
}

func EmbedPoolSlots() int {
	if v := os.Getenv("EMBED_POOL_SLOTS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultEmbedPoolSlots
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
	return int64(float64(total) * poolCPUratio())
}

func OCRPageMemory() int64 {
	return taskMemoryMB("OCR_PAGE_MEMORY_MB", defaultOCRPageMB)
}

func EmbedBatchMemory() int64 {
	return taskMemoryMB("EMBED_BATCH_MEMORY_MB", defaultEmbedBatchMB)
}

func FastIngestPrefetch() int {
	if v := os.Getenv("FAST_INGEST_PREFETCH"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultFastIngestPrefetch
}

func OCRIngestPrefetch() int {
	if v := os.Getenv("OCR_INGEST_PREFETCH"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	if v := os.Getenv("INGEST_PREFETCH"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return defaultOCRIngestPrefetch
}

func RabbitPrefetch() int {
	return FastIngestPrefetch() + OCRIngestPrefetch()
}

func embedMemoryBudgetBytes() int64 {
	slots := int64(EmbedPoolSlots())
	batch := EmbedBatchMemory()
	budget := slots * batch * 2
	if v := os.Getenv("EMBED_MEMORY_BUDGET_MB"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			return n * 1024 * 1024
		}
	}
	if budget < batch {
		return batch
	}
	return budget
}

func taskMemoryMB(envKey string, fallback int) int64 {
	if v := os.Getenv(envKey); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return int64(n) * 1024 * 1024
		}
	}
	return int64(fallback) * 1024 * 1024
}
