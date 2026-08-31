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

func TestKrakenCLIArgs(t *testing.T) {
	t.Setenv("KRAKEN_THREADS", "2")
	t.Setenv("KRAKEN_PRECISION", "bf16-mixed")
	t.Setenv("KRAKEN_LINE_BATCH", "64")
	t.Setenv("KRAKEN_LINE_WORKERS", "8")

	args := krakenCLIArgs("cuda:0", []string{"/tmp/page-1.png"}, "/models/grc.mlmodel")
	want := []string{
		"--device", "cuda:0", "--threads", "2", "--precision", "bf16-mixed",
		"-i", "/tmp/page-1.png", "/tmp/page-1.png.txt",
		"binarize", "segment", "-bl", "ocr", "-m", "/models/grc.mlmodel",
		"-B", "64", "--num-line-workers", "8",
	}
	if len(args) != len(want) {
		t.Fatalf("len %d want %d: %#v", len(args), len(want), args)
	}
	for i := range want {
		if args[i] != want[i] {
			t.Fatalf("args[%d]=%q want %q full=%#v", i, args[i], want[i], args)
		}
	}
}

func TestKrakenCLIArgsDefaults(t *testing.T) {
	t.Setenv("KRAKEN_THREADS", "")
	t.Setenv("KRAKEN_PRECISION", "")
	t.Setenv("KRAKEN_LINE_BATCH", "")
	t.Setenv("KRAKEN_LINE_WORKERS", "")

	args := krakenCLIArgs("cpu", []string{"/tmp/a.png", "/tmp/b.png"}, "/models/grc.mlmodel")
	if contains(args, "--precision") || contains(args, "-B") || contains(args, "--num-line-workers") {
		t.Fatalf("optional GPU flags should be omitted: %#v", args)
	}
}

func TestKrakenOutputPaths(t *testing.T) {
	paths := []string{"/tmp/page-1.png", "/tmp/page-2.png"}
	out := krakenOutputPaths(paths)
	want := []string{"/tmp/page-1.png.txt", "/tmp/page-2.png.txt"}
	if len(out) != len(want) {
		t.Fatalf("got %#v", out)
	}
	for i := range want {
		if out[i] != want[i] {
			t.Fatalf("out[%d]=%q want %q", i, out[i], want[i])
		}
	}
}

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
