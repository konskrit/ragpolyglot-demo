package extractor

import (
	"strings"
	"testing"
)

func TestHasEnoughText(t *testing.T) {
	if hasEnoughText("abc") {
		t.Fatal("short string should not count as a text layer")
	}
	if hasEnoughText(strings.Repeat("a", minNativeLetters-1)) {
		t.Fatal("below threshold should not count as a text layer")
	}
	if !hasEnoughText(strings.Repeat("a", minNativeLetters)) {
		t.Fatal("at threshold should count as a text layer")
	}
}

func TestParseOsdScript(t *testing.T) {
	osd := "Orientation in degrees: 0\nScript: Greek\nScript confidence: 5.00\n"
	if got := parseOsdScript(osd); got != "Greek" {
		t.Fatalf("got %q", got)
	}
	if got := parseOsdScript("no script here"); got != "" {
		t.Fatalf("got %q", got)
	}
}

func TestTesseractLangs(t *testing.T) {
	if got := tesseractLangs("ancient_greek"); got != "grc+ell" {
		t.Fatalf("got %q", got)
	}
	if got := tesseractLangs("modern_greek"); got != "ell" {
		t.Fatalf("got %q", got)
	}
	if got := tesseractLangs("english"); got != "eng" {
		t.Fatalf("got %q", got)
	}
	if got := tesseractLangs(""); got != "" {
		t.Fatalf("empty hint should be auto, got %q", got)
	}
	if got := tesseractLangs("fra"); got != "fra" {
		t.Fatalf("tessdata codes pass through, got %q", got)
	}
}

func TestLangsForDetectedScript(t *testing.T) {
	got, err := langsForDetectedScript("Greek")
	if err != nil || got != "grc+ell" {
		t.Fatalf("greek: got %q err %v", got, err)
	}
	got, err = langsForDetectedScript("Latin")
	if err != nil || got != "eng+fra+deu+ita+lat" {
		t.Fatalf("latin: got %q err %v", got, err)
	}
	got, err = langsForDetectedScript("Cyrillic")
	if err != nil || got != "rus+srp+bul" {
		t.Fatalf("cyrillic: got %q err %v", got, err)
	}
	_, err = langsForDetectedScript("Arabic")
	if err != ErrOcrLanguageNeeded {
		t.Fatalf("arabic: want ErrOcrLanguageNeeded, got %v", err)
	}
}
