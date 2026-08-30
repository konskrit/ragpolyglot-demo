package extractor

import "testing"

func TestListLanguages(t *testing.T) {
	langs, err := ListLanguages()
	if err != nil {
		t.Fatal(err)
	}
	if len(langs) != len(ocrLanguageMenu) {
		t.Fatalf("want %d langs, got %#v", len(ocrLanguageMenu), langs)
	}
	found := map[string]bool{}
	for _, lang := range langs {
		found[lang.Code] = true
	}
	for _, want := range []string{"eng", "ell", "grc", "grc+ell", "deu", "fra", "ita", "lat", "rus", "srp", "bul"} {
		if !found[want] {
			t.Fatalf("missing %s: %#v", want, langs)
		}
	}
}
