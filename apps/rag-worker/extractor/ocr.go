package extractor

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const (
	minNativeLetters = 100
	maxOsdPages      = 3
)

var (
	ErrOcrLanguageNeeded = errors.New("ocr_language_needed")
	ErrPaused            = errors.New("paused")
)

type OCRProgressFunc func(done, total int, textSoFar, langs string) error

type OCRState struct {
	StartPage   int
	PriorText   string
	Resolved    string
	ShouldPause func() bool
	OnProgress  OCRProgressFunc
}

func hasEnoughText(s string) bool {
	n := 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			n++
			if n >= minNativeLetters {
				return true
			}
		}
	}
	return false
}

func extractPDFWithOCR(pdfPath, ocrLang string, state OCRState) (text string, resolved string, err error) {
	total, err := pdfPageCount(pdfPath)
	if err != nil {
		return "", "", err
	}

	start := state.StartPage
	if start < 1 {
		start = 1
	}
	if start > total+1 {
		return "", "", fmt.Errorf("ocr start page %d past end %d", start, total)
	}

	var b strings.Builder
	if prior := strings.TrimSpace(state.PriorText); prior != "" {
		b.WriteString(prior)
	}

	langs := strings.TrimSpace(state.Resolved)
	if langs == "" && start > 1 {
		return b.String(), "", fmt.Errorf("ocr resume missing resolved language")
	}

	dir, err := os.MkdirTemp("", "ocr-*")
	if err != nil {
		return "", "", fmt.Errorf("ocr temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	if langs == "" {
		limit := maxOsdPages
		if total < limit {
			limit = total
		}
		osdPaths := make([]string, 0, limit)
		for page := 1; page <= limit; page++ {
			img, err := renderPDFPage(pdfPath, page, filepath.Join(dir, fmt.Sprintf("osd-%d", page)))
			if err != nil {
				return "", "", err
			}
			osdPaths = append(osdPaths, img)
		}
		langs, err = resolveLangsFromPages(ocrLang, osdPaths)
		if err != nil {
			return "", "", err
		}
	}

	log.Printf("[Extractor] OCR starting page=%d/%d langs=%s", start, total, langs)

	for page := start; page <= total; page++ {
		if state.ShouldPause != nil && state.ShouldPause() {
			return b.String(), langs, ErrPaused
		}

		img, err := renderPDFPage(pdfPath, page, filepath.Join(dir, fmt.Sprintf("page-%d", page)))
		if err != nil {
			return "", langs, err
		}
		pageText, err := tesseractPage(img, langs)
		_ = os.Remove(img)
		if err != nil {
			return "", langs, err
		}
		if pageText != "" {
			if b.Len() > 0 {
				b.WriteByte('\n')
			}
			b.WriteString(pageText)
		}

		if page == 1 || page == total || page%10 == 0 {
			log.Printf("[Extractor] OCR progress %d/%d", page, total)
		}
		if state.OnProgress != nil {
			if err := state.OnProgress(page, total, b.String(), langs); err != nil {
				return b.String(), langs, err
			}
		}
	}

	text = trimToLimit(strings.TrimSpace(b.String()))
	if text == "" {
		if tesseractLangs(ocrLang) == "" && state.Resolved == "" {
			return "", langs, ErrOcrLanguageNeeded
		}
		return "", langs, fmt.Errorf("no text extracted")
	}
	return text, langs, nil
}
