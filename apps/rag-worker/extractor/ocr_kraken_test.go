package extractor

import (
	"strings"
	"testing"
)

func TestKrakenCLIArgs(t *testing.T) {
	resetKrakenDeviceForTest(t)
	krakenDeviceMu.Lock()
	krakenDevice = "cuda:0"
	krakenDeviceInit = true
	krakenDeviceMu.Unlock()
	t.Setenv("KRAKEN_PRECISION", "")
	t.Setenv("KRAKEN_LINE_BATCH", "")
	t.Setenv("KRAKEN_LINE_WORKERS", "")

	args := krakenCLIArgs("cuda:0", []string{"/tmp/page-1.png"}, "/models/grc.mlmodel")
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "binarize") {
		t.Fatalf("kraken 7 baseline pipeline should skip binarize: %q", joined)
	}
	for _, want := range []string{"--device", "cuda:0", "--precision", "bf16-mixed", "segment", "-bl", "ocr", "-m", "/models/grc.mlmodel", "-B", "256", "--num-line-workers"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in %q", want, joined)
		}
	}
}

func TestKrakenCLIArgsCPUOmitsGPUBatchFlags(t *testing.T) {
	resetKrakenDeviceForTest(t)
	t.Setenv("KRAKEN_DEVICE", "cpu")
	t.Setenv("KRAKEN_PRECISION", "")
	t.Setenv("KRAKEN_LINE_BATCH", "")
	t.Setenv("KRAKEN_LINE_WORKERS", "")

	args := krakenCLIArgs("cpu", []string{"/tmp/page-1.png"}, "/models/grc.mlmodel")
	joined := strings.Join(args, " ")
	if strings.Contains(joined, "-B") || strings.Contains(joined, "--num-line-workers") {
		t.Fatalf("cpu args should not set GPU batch flags: %q", joined)
	}
}
