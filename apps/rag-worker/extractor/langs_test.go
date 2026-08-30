package extractor

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLanguageLabel(t *testing.T) {
	if got := languageLabel("grc"); got != "Greek (Ancient)" {
		t.Fatalf("grc: %q", got)
	}
	if got := languageLabel("eng"); got == "" || got == "eng" {
		t.Fatalf("eng label should resolve, got %q", got)
	}
}

func TestListLanguages(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("TESSDATA_PREFIX", dir)
	for _, name := range []string{"eng.traineddata", "ell.traineddata", "osd.traineddata"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	langs, err := ListLanguages()
	if err != nil {
		t.Fatal(err)
	}
	if len(langs) != 2 {
		t.Fatalf("want 2 langs (osd skipped), got %#v", langs)
	}
	if langs[0].Code != "ell" && langs[1].Code != "ell" {
		t.Fatalf("missing ell: %#v", langs)
	}
}

func TestListLanguagesIncludesGreekCombo(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("TESSDATA_PREFIX", dir)
	for _, name := range []string{"grc.traineddata", "ell.traineddata"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	langs, err := ListLanguages()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, lang := range langs {
		if lang.Code == "grc+ell" {
			found = true
			if lang.Label != "Greek (Ancient + Modern)" {
				t.Fatalf("label: %q", lang.Label)
			}
		}
	}
	if !found {
		t.Fatalf("missing grc+ell: %#v", langs)
	}
	if len(langs) != 3 {
		t.Fatalf("want grc, ell, grc+ell; got %#v", langs)
	}
}
