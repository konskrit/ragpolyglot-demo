package extractor

import "sort"

type LanguageOption struct {
	Code  string `json:"code"`
	Label string `json:"label"`
}

var ocrLanguageMenu = []LanguageOption{
	{Code: "bul", Label: "Bulgarian"},
	{Code: "eng", Label: "English"},
	{Code: "fra", Label: "French"},
	{Code: "deu", Label: "German"},
	{Code: "ell", Label: "Greek (Modern)"},
	{Code: "grc", Label: "Greek (Ancient)"},
	{Code: "grc+ell", Label: "Greek (Ancient + Modern)"},
	{Code: "ita", Label: "Italian"},
	{Code: "lat", Label: "Latin"},
	{Code: "rus", Label: "Russian"},
	{Code: "srp", Label: "Serbian"},
}

func ListLanguages() ([]LanguageOption, error) {
	out := make([]LanguageOption, len(ocrLanguageMenu))
	copy(out, ocrLanguageMenu)
	sort.Slice(out, func(i, j int) bool {
		return out[i].Label < out[j].Label
	})
	return out, nil
}
