package extractor

import (
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
	// BOM FF FE + "Hi" as UTF-16LE
	input := []byte{0xFF, 0xFE, 'H', 0x00, 'i', 0x00}
	got := detectAndConvertEncoding(input)
	if got != "Hi" {
		t.Fatalf("got %q, want %q", got, "Hi")
	}
}

func TestDetectAndConvertEncoding_UTF16BE(t *testing.T) {
	// BOM FE FF + "Hi" as UTF-16BE
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
