package extractor

import (
	"testing"
)

func resetKrakenDeviceForTest(t *testing.T) {
	t.Helper()
	krakenDeviceMu.Lock()
	krakenDeviceInit = false
	krakenDevice = ""
	krakenDeviceMu.Unlock()
}

func TestKrakenBatchPages(t *testing.T) {
	t.Setenv("KRAKEN_BATCH_PAGES", "8")
	if got := krakenBatchPages(); got != 8 {
		t.Fatalf("got %d", got)
	}
	t.Setenv("KRAKEN_BATCH_PAGES", "")
	if got := krakenBatchPages(); got != defaultKrakenBatchPages {
		t.Fatalf("default batch size got %d", got)
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
