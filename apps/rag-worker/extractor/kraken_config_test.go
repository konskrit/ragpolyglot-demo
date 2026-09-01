package extractor

import (
	"sync"
	"testing"
)

func resetKrakenDeviceForTest(t *testing.T) {
	t.Helper()
	krakenDeviceMu.Lock()
	krakenDeviceInit = false
	krakenDevice = ""
	krakenDeviceMu.Unlock()
}

func resetKrakenGPUSemForTest(t *testing.T) {
	t.Helper()
	krakenGPUSemOnce = sync.Once{}
	krakenGPUSem = nil
}

func TestKrakenBatchPages(t *testing.T) {
	t.Setenv("KRAKEN_BATCH_PAGES", "8")
	if got := krakenBatchPages(); got != 8 {
		t.Fatalf("got %d", got)
	}
	t.Setenv("KRAKEN_BATCH_PAGES", "")
	resetKrakenDeviceForTest(t)
	t.Setenv("KRAKEN_DEVICE", "cpu")
	if got := krakenBatchPages(); got != defaultKrakenBatchPages {
		t.Fatalf("cpu default batch size got %d", got)
	}
	resetKrakenDeviceForTest(t)
	krakenDeviceMu.Lock()
	krakenDevice = "cuda:0"
	krakenDeviceInit = true
	krakenDeviceMu.Unlock()
	if got := krakenBatchPages(); got != defaultKrakenBatchPagesGPU {
		t.Fatalf("cuda default batch size got %d", got)
	}
}

func TestKrakenGPUDefaults(t *testing.T) {
	resetKrakenDeviceForTest(t)
	krakenDeviceMu.Lock()
	krakenDevice = "cuda:0"
	krakenDeviceInit = true
	krakenDeviceMu.Unlock()

	t.Setenv("KRAKEN_PRECISION", "")
	t.Setenv("KRAKEN_LINE_BATCH", "")
	t.Setenv("KRAKEN_LINE_WORKERS", "")
	if got := krakenPrecision(); got != defaultKrakenPrecisionGPU {
		t.Fatalf("precision: got %q", got)
	}
	if n, ok := krakenLineBatch(); !ok || n != defaultKrakenLineBatch {
		t.Fatalf("line batch: got %d ok=%v", n, ok)
	}
	if n, ok := krakenLineWorkers(); !ok || n < 1 {
		t.Fatalf("line workers: got %d ok=%v", n, ok)
	}
}

func TestKrakenCPUSkipsGPUDefaults(t *testing.T) {
	resetKrakenDeviceForTest(t)
	t.Setenv("KRAKEN_DEVICE", "cpu")
	t.Setenv("KRAKEN_PRECISION", "")
	t.Setenv("KRAKEN_LINE_BATCH", "")
	if got := krakenPrecision(); got != "" {
		t.Fatalf("cpu precision should be empty, got %q", got)
	}
	if _, ok := krakenLineBatch(); ok {
		t.Fatal("cpu should not set line batch")
	}
}

func TestKrakenVRAMBudgetPerJob(t *testing.T) {
	t.Setenv("KRAKEN_VRAM_BUDGET_MB", "22528")
	t.Setenv("KRAKEN_GPU_CONCURRENT", "2")
	if got := krakenVRAMBudgetPerJobMB(); got != 11264 {
		t.Fatalf("got %d want 11264", got)
	}
	t.Setenv("KRAKEN_GPU_CONCURRENT", "1")
	if got := krakenVRAMBudgetPerJobMB(); got != 22528 {
		t.Fatalf("single job: got %d want 22528", got)
	}
}

func TestEffectiveKrakenBatchSizeVRAMCap(t *testing.T) {
	resetKrakenDeviceForTest(t)
	krakenDeviceMu.Lock()
	krakenDevice = "cuda:0"
	krakenDeviceInit = true
	krakenDeviceMu.Unlock()

	t.Setenv("KRAKEN_BATCH_PAGES", "10")
	t.Setenv("KRAKEN_VRAM_BUDGET_MB", "1536")
	t.Setenv("KRAKEN_VRAM_PAGE_MB", "512")
	t.Setenv("KRAKEN_GPU_CONCURRENT", "1")
	if got := effectiveKrakenBatchSize(); got != 3 {
		t.Fatalf("VRAM cap: got %d want 3", got)
	}
}

func TestDetectKrakenDeviceCPU(t *testing.T) {
	resetKrakenDeviceForTest(t)
	t.Setenv("KRAKEN_DEVICE", "cpu")
	if got := detectKrakenDevice(); got != "cpu" {
		t.Fatalf("got %q", got)
	}
}

func TestDetectKrakenDeviceExplicitCUDAWithoutGPU(t *testing.T) {
	resetKrakenDeviceForTest(t)
	t.Setenv("KRAKEN_DEVICE", "cuda:0")
	got := detectKrakenDevice()
	if got != "cpu" && got != "cuda:0" {
		t.Fatalf("got %q", got)
	}
}
