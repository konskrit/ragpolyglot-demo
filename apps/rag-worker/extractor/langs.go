package extractor

import (
	"os"
	"sort"
	"strings"

	"golang.org/x/text/language"
	"golang.org/x/text/language/display"
)

type LanguageOption struct {
	Code  string `json:"code"`
	Label string `json:"label"`
}

var skipTessdata = map[string]struct{}{
	"osd":  {},
	"equ":  {},
	"snum": {},
}

var labelOverrides = map[string]string{
	"grc":          "Greek (Ancient)",
	"ell":          "Greek (Modern)",
	"chi_sim":      "Chinese (Simplified)",
	"chi_tra":      "Chinese (Traditional)",
	"chi_sim_vert": "Chinese (Simplified, vertical)",
	"chi_tra_vert": "Chinese (Traditional, vertical)",
	"deu_latf":     "German (Fraktur)",
	"frk":          "German (Fraktur)",
	"frm":          "French (Middle)",
	"enm":          "English (Middle)",
	"ita_old":      "Italian (Old)",
	"spa_old":      "Spanish (Old)",
}

func tessdataDir() string {
	if v := strings.TrimSpace(os.Getenv("TESSDATA_PREFIX")); v != "" {
		return v
	}
	return "/usr/share/tessdata"
}

func ListLanguages() ([]LanguageOption, error) {
	entries, err := os.ReadDir(tessdataDir())
	if err != nil {
		return nil, err
	}

	out := make([]LanguageOption, 0, len(entries))
	hasGrc, hasEll := false, false
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".traineddata") {
			continue
		}
		code := strings.TrimSuffix(name, ".traineddata")
		if _, skip := skipTessdata[code]; skip {
			continue
		}
		if code == "grc" {
			hasGrc = true
		}
		if code == "ell" {
			hasEll = true
		}
		out = append(out, LanguageOption{
			Code:  code,
			Label: languageLabel(code),
		})
	}

	if hasGrc && hasEll {
		out = append(out, LanguageOption{
			Code:  "grc+ell",
			Label: "Greek (Ancient + Modern)",
		})
	}

	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Label) < strings.ToLower(out[j].Label)
	})
	return out, nil
}

func languageLabel(code string) string {
	if label, ok := labelOverrides[code]; ok {
		return label
	}

	tag, err := language.Parse(code)
	if err != nil {
		base, _, _ := strings.Cut(code, "_")
		tag, err = language.Parse(base)
	}
	if err != nil {
		return code
	}
	name := display.English.Languages().Name(tag)
	if name == "" || name == code {
		return code
	}
	return name
}
