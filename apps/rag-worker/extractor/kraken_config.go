package extractor

import (
	"log"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

const (
	defaultKrakenBatchPages    = 16
	defaultKrakenBatchPagesGPU = 64
	defaultKrakenThreads       = 4
	defaultKrakenVRAMBudgetMB  = 16384
	defaultKrakenVRAMPageMB    = 256
	defaultKrakenPageMemoryMB  = 256
	defaultKrakenLineBatch     = 128
	defaultKrakenPrecisionGPU  = "bf16-mixed"
)

var (
	krakenDeviceMu   sync.Mutex
	krakenDevice     string
	krakenDeviceInit bool
)

func envPositiveInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func envOptionalPositiveInt(key string) (int, bool) {
	v := os.Getenv(key)
	if v == "" {
		return 0, false
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

func envOptionalNonNegInt(key string) (int, bool) {
	v := os.Getenv(key)
	if v == "" {
		return 0, false
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

func krakenPrecision() string {
	if v := strings.TrimSpace(os.Getenv("KRAKEN_PRECISION")); v != "" {
		return v
	}
	if krakenOnCUDA() {
		return defaultKrakenPrecisionGPU
	}
	return ""
}

func krakenLineBatch() (int, bool) {
	if n, ok := envOptionalPositiveInt("KRAKEN_LINE_BATCH"); ok {
		return n, true
	}
	if krakenOnCUDA() {
		return defaultKrakenLineBatch, true
	}
	return 0, false
}

func krakenLineWorkers() (int, bool) {
	if n, ok := envOptionalNonNegInt("KRAKEN_LINE_WORKERS"); ok {
		return n, true
	}
	if krakenOnCUDA() {
		n := runtime.NumCPU()
		if n > 8 {
			n = 8
		}
		if n < 1 {
			n = 1
		}
		return n, true
	}
	return 0, false
}

func krakenOnCUDA() bool {
	return strings.HasPrefix(currentKrakenDevice(), "cuda")
}

func currentKrakenDevice() string {
	krakenDeviceMu.Lock()
	ready := krakenDeviceInit
	dev := krakenDevice
	krakenDeviceMu.Unlock()
	if ready {
		return dev
	}
	return resolveKrakenDevice()
}

func krakenBatchPages() int {
	if n, ok := envOptionalPositiveInt("KRAKEN_BATCH_PAGES"); ok {
		return n
	}
	if krakenOnCUDA() {
		return defaultKrakenBatchPagesGPU
	}
	return defaultKrakenBatchPages
}

func krakenThreads() int {
	if v := os.Getenv("KRAKEN_THREADS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	n := runtime.NumCPU()
	if n > defaultKrakenThreads {
		n = defaultKrakenThreads
	}
	if n < 1 {
		n = 1
	}
	return n
}

func krakenVRAMBudgetMB() int {
	return envPositiveInt("KRAKEN_VRAM_BUDGET_MB", defaultKrakenVRAMBudgetMB)
}

func krakenVRAMPerPageMB() int {
	return envPositiveInt("KRAKEN_VRAM_PAGE_MB", defaultKrakenVRAMPageMB)
}

func krakenPageMemory() int64 {
	return int64(envPositiveInt("KRAKEN_PAGE_MEMORY_MB", defaultKrakenPageMemoryMB)) * 1024 * 1024
}

func effectiveKrakenBatchSize() int {
	configured := krakenBatchPages()
	device := resolveKrakenDevice()
	if !strings.HasPrefix(device, "cuda") {
		return configured
	}
	budget := krakenVRAMBudgetMB()
	perPage := krakenVRAMPerPageMB()
	if budget <= 0 || perPage <= 0 {
		return configured
	}
	maxByVRAM := budget / perPage
	if maxByVRAM < 1 {
		maxByVRAM = 1
	}
	if configured > maxByVRAM {
		return maxByVRAM
	}
	return configured
}

func resolveKrakenDevice() string {
	krakenDeviceMu.Lock()
	defer krakenDeviceMu.Unlock()
	if !krakenDeviceInit {
		krakenDevice = detectKrakenDevice()
		krakenDeviceInit = true
		log.Printf("[Extractor] kraken device=%s", krakenDevice)
	}
	return krakenDevice
}

func fallbackKrakenToCPU() {
	krakenDeviceMu.Lock()
	defer krakenDeviceMu.Unlock()
	if strings.HasPrefix(krakenDevice, "cuda") {
		log.Printf("[Extractor] kraken falling back from %s to cpu", krakenDevice)
		krakenDevice = "cpu"
	}
}

func detectKrakenDevice() string {
	hint := strings.ToLower(strings.TrimSpace(os.Getenv("KRAKEN_DEVICE")))
	switch hint {
	case "", "auto":
		if cudaAvailable() {
			return "cuda:0"
		}
		return "cpu"
	case "cpu":
		return "cpu"
	default:
		if strings.HasPrefix(hint, "cuda") && !cudaAvailable() {
			log.Printf("[Extractor] KRAKEN_DEVICE=%s but no CUDA GPU, using cpu", hint)
			return "cpu"
		}
		return hint
	}
}

func cudaAvailable() bool {
	err := exec.Command(
		"python3", "-c",
		"import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)",
	).Run()
	return err == nil
}
