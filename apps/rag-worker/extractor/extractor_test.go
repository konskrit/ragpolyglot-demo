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

func TestReadFile_RejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("UPLOADS_DIR", dir)

	secret := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(secret, []byte("nope"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := ReadFile(secret)
	if err == nil {
		t.Fatal("expected error for path outside uploads root")
	}

	safeName := "doc.txt"
	if err := os.WriteFile(filepath.Join(dir, safeName), []byte("ok"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := ReadFile("/uploads/../etc/" + safeName)
	if err != nil {
		t.Fatalf("expected basename-safe read: %v", err)
	}
	if string(got) != "ok" {
		t.Fatalf("got %q", got)
	}
}
