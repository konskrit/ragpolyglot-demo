package extractor

import (
	"bytes"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

const (
	minNativeLetters = 100
	maxOsdPages      = 3
)

var ErrOcrLanguageNeeded = errors.New("ocr_language_needed")

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

func tesseractLangs(hint string) string {
	switch strings.TrimSpace(hint) {
	case "ancient_greek":
		return "grc+ell"
	case "modern_greek":
		return "ell"
	case "english":
		return "eng"
	case "":
		return ""
	default:
		return strings.TrimSpace(hint)
	}
}

func parseOsdScript(osd string) string {
	const prefix = "script:"
	for _, line := range strings.Split(osd, "\n") {
		trimmed := strings.TrimSpace(line)
		if len(trimmed) < len(prefix) {
			continue
		}
		if strings.EqualFold(trimmed[:len(prefix)], prefix) {
			return strings.TrimSpace(trimmed[len(prefix):])
		}
	}
	return ""
}

func langsForDetectedScript(script string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(script)) {
	case "greek":
		return "grc+ell", nil
	case "latin":
		return "eng", nil
	default:
		return "", ErrOcrLanguageNeeded
	}
}

func resolveTesseractLangs(hint string, pages []string) (string, error) {
	if langs := tesseractLangs(hint); langs != "" {
		return langs, nil
	}
	if len(pages) == 0 {
		return "", ErrOcrLanguageNeeded
	}

	limit := maxOsdPages
	if len(pages) < limit {
		limit = len(pages)
	}

	var lastErr error
	for _, page := range pages[:limit] {
		script, err := detectScript(page)
		if err != nil {
			lastErr = err
			continue
		}
		return langsForDetectedScript(script)
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", ErrOcrLanguageNeeded
}

func detectScript(imagePath string) (string, error) {
	cmd := exec.Command("tesseract", imagePath, "stdout", "--psm", "0", "-l", "osd")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("tesseract osd failed: %w (stderr: %s)", err, stderr.String())
	}
	script := parseOsdScript(stdout.String())
	if script == "" {
		return "", fmt.Errorf("tesseract osd produced no script")
	}
	return script, nil
}

func tesseractPage(imagePath, langs string) (string, error) {
	cmd := exec.Command("tesseract", imagePath, "stdout", "-l", langs, "--psm", "6")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("tesseract failed: %w (stderr: %s)", err, stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
}

// pdftoppm writes page-1.png, page-10.png without zero-padding; lexicographic
// sort would put page-10 before page-2.
func pageNumber(path string) int {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	_, num, ok := strings.Cut(base, "-")
	if !ok {
		return 0
	}
	n, err := strconv.Atoi(num)
	if err != nil {
		return 0
	}
	return n
}

func extractPDFWithOCR(pdfPath, ocrLang string) (string, error) {
	dir, err := os.MkdirTemp("", "ocr-*")
	if err != nil {
		return "", fmt.Errorf("ocr temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	prefix := filepath.Join(dir, "page")
	cmd := exec.Command("pdftoppm", "-png", "-r", "200", pdfPath, prefix)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pdftoppm failed: %w (stderr: %s)", err, stderr.String())
	}

	pages, err := filepath.Glob(prefix + "-*.png")
	if err != nil {
		return "", err
	}
	sort.Slice(pages, func(i, j int) bool {
		return pageNumber(pages[i]) < pageNumber(pages[j])
	})
	if len(pages) == 0 {
		return "", fmt.Errorf("pdftoppm produced no pages")
	}

	langs, err := resolveTesseractLangs(ocrLang, pages)
	if err != nil {
		return "", err
	}
	log.Printf("[Extractor] OCR starting pages=%d langs=%s", len(pages), langs)
	var b strings.Builder
	for i, page := range pages {
		text, err := tesseractPage(page, langs)
		if err != nil {
			return "", err
		}
		done := i + 1
		if done == 1 || done == len(pages) || done%10 == 0 {
			log.Printf("[Extractor] OCR progress %d/%d", done, len(pages))
		}
		if text == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(text)
	}

	text := trimToLimit(strings.TrimSpace(b.String()))
	if text == "" {
		if tesseractLangs(ocrLang) == "" {
			return "", ErrOcrLanguageNeeded
		}
		return "", fmt.Errorf("no text extracted")
	}
	return text, nil
}
