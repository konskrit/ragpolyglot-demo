package extractor

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectAndConvertEncoding_UTF8BOM(t *testing.T) {
	input := append([]byte{0xEF, 0xBB, 0xBF}, []byte("hello")...)
	got := detectAndConvertEncoding(input)
	if got != "hello" {
		t.Fatalf("got %q, want %q", got, "hello")
	}
}

func TestDetectAndConvertEncoding_UTF16LE(t *testing.T) {
	input := []byte{0xFF, 0xFE, 'H', 0x00, 'i', 0x00}
	got := detectAndConvertEncoding(input)
	if got != "Hi" {
		t.Fatalf("got %q, want %q", got, "Hi")
	}
}

func TestDetectAndConvertEncoding_UTF16BE(t *testing.T) {
	input := []byte{0xFE, 0xFF, 0x00, 'H', 0x00, 'i'}
	got := detectAndConvertEncoding(input)
	if got != "Hi" {
		t.Fatalf("got %q, want %q", got, "Hi")
	}
}

func TestEnsureValidUTF8(t *testing.T) {
	got := ensureValidUTF8("ok\xffmore")
	if got != "okmore" {
		t.Fatalf("got %q, want %q", got, "okmore")
	}
}

func TestExtractFromPath_RejectsOutsideUploads(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("UPLOADS_DIR", dir)

	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("nope"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := ExtractFromPath(outside)
	if err == nil {
		t.Fatal("expected error when file is not in uploads root")
	}
}

func TestExtractFromPath_PlainText(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("UPLOADS_DIR", dir)

	name := "notes.txt"
	if err := os.WriteFile(filepath.Join(dir, name), []byte("hello ingest"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := ExtractFromPath("/uploads/" + name)
	if err != nil {
		t.Fatal(err)
	}
	if got != "hello ingest" {
		t.Fatalf("got %q", got)
	}
}

func TestTrimToLimit(t *testing.T) {
	t.Setenv("MAX_EXTRACTED_CHARS", "3")
	got := trimToLimit("hello")
	if got != "hel" {
		t.Fatalf("got %q", got)
	}
}
