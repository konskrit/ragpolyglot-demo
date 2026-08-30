package extractor

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

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
		return "eng+fra+deu+ita+lat", nil
	case "cyrillic":
		return "rus+srp+bul", nil
	default:
		return "", ErrOcrLanguageNeeded
	}
}

func checkPaused(stop func() bool) error {
	if stop != nil && stop() {
		return ErrPaused
	}
	return nil
}

func runCapture(stop func() bool, name string, args ...string) (stdout string, err error) {
	if err := checkPaused(stop); err != nil {
		return "", err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if stop != nil {
		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(25 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if stop() {
						cancel()
						return
					}
				}
			}
		}()
	}

	if err := cmd.Run(); err != nil {
		if stop != nil && stop() {
			return "", ErrPaused
		}
		return "", fmt.Errorf("%s failed: %w (stderr: %s)", name, err, stderr.String())
	}
	return out.String(), nil
}

func isOsdSoftError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "too few characters") ||
		strings.Contains(msg, "no script") ||
		strings.Contains(msg, "error during processing")
}

func detectScript(imagePath string, stop func() bool) (string, error) {
	out, err := runCapture(stop, "tesseract", imagePath, "stdout", "--psm", "0", "-l", "osd")
	if err != nil {
		if errors.Is(err, ErrPaused) {
			return "", err
		}
		return "", fmt.Errorf("tesseract osd failed: %w", err)
	}
	script := parseOsdScript(out)
	if script == "" {
		return "", fmt.Errorf("tesseract osd produced no script")
	}
	return script, nil
}

func tesseractPage(imagePath, langs string, stop func() bool) (string, error) {
	out, err := runCapture(stop, "tesseract", imagePath, "stdout", "-l", langs, "--psm", "6")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func pdfPageCount(pdfPath string, stop func() bool) (int, error) {
	out, err := runCapture(stop, "pdfinfo", pdfPath)
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(strings.ToLower(line), "pages:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			break
		}
		n, err := strconv.Atoi(fields[len(fields)-1])
		if err != nil || n < 1 {
			return 0, fmt.Errorf("pdfinfo: invalid page count %q", fields[len(fields)-1])
		}
		return n, nil
	}
	return 0, fmt.Errorf("pdfinfo: pages field missing")
}

func renderPDFPage(pdfPath string, page int, outPrefix string, stop func() bool) (string, error) {
	_, err := runCapture(
		stop,
		"pdftoppm",
		"-png",
		"-r", "200",
		"-f", strconv.Itoa(page),
		"-l", strconv.Itoa(page),
		"-singlefile",
		pdfPath,
		outPrefix,
	)
	if err != nil {
		if errors.Is(err, ErrPaused) {
			return "", err
		}
		return "", fmt.Errorf("pdftoppm page %d: %w", page, err)
	}
	path := outPrefix + ".png"
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("pdftoppm page %d produced no image", page)
	}
	return path, nil
}

func resolveLangsFromPages(hint string, imagePaths []string, stop func() bool) (string, error) {
	if langs := tesseractLangs(hint); langs != "" {
		return langs, nil
	}
	if len(imagePaths) == 0 {
		return "", ErrOcrLanguageNeeded
	}
	var lastErr error
	for _, page := range imagePaths {
		if err := checkPaused(stop); err != nil {
			return "", err
		}
		script, err := detectScript(page, stop)
		if err != nil {
			if errors.Is(err, ErrPaused) {
				return "", err
			}
			lastErr = err
			continue
		}
		langs, err := langsForDetectedScript(script)
		if err != nil {
			if errors.Is(err, ErrOcrLanguageNeeded) {
				lastErr = err
				continue
			}
			return "", err
		}
		log.Printf("[Extractor] OSD script=%s langs=%s", script, langs)
		return langs, nil
	}
	if lastErr != nil {
		if isOsdSoftError(lastErr) {
			return "", ErrOcrLanguageNeeded
		}
		return "", lastErr
	}
	return "", ErrOcrLanguageNeeded
}
