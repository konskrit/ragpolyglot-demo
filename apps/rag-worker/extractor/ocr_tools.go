package extractor

import (
	"bytes"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
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

func runCapture(name string, args ...string) (stdout string, err error) {
	cmd := exec.Command(name, args...)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s failed: %w (stderr: %s)", name, err, stderr.String())
	}
	return out.String(), nil
}

func detectScript(imagePath string) (string, error) {
	out, err := runCapture("tesseract", imagePath, "stdout", "--psm", "0", "-l", "osd")
	if err != nil {
		return "", fmt.Errorf("tesseract osd failed: %w", err)
	}
	script := parseOsdScript(out)
	if script == "" {
		return "", fmt.Errorf("tesseract osd produced no script")
	}
	return script, nil
}

func tesseractPage(imagePath, langs string) (string, error) {
	out, err := runCapture("tesseract", imagePath, "stdout", "-l", langs, "--psm", "6")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func pdfPageCount(pdfPath string) (int, error) {
	out, err := runCapture("pdfinfo", pdfPath)
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

func renderPDFPage(pdfPath string, page int, outPrefix string) (string, error) {
	cmd := exec.Command(
		"pdftoppm",
		"-png",
		"-r", "200",
		"-f", strconv.Itoa(page),
		"-l", strconv.Itoa(page),
		"-singlefile",
		pdfPath,
		outPrefix,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pdftoppm page %d: %w (stderr: %s)", page, err, stderr.String())
	}
	path := outPrefix + ".png"
	if _, err := os.Stat(path); err != nil {
		return "", fmt.Errorf("pdftoppm page %d produced no image", page)
	}
	return path, nil
}

func resolveLangsFromPages(hint string, imagePaths []string) (string, error) {
	if langs := tesseractLangs(hint); langs != "" {
		return langs, nil
	}
	if len(imagePaths) == 0 {
		return "", ErrOcrLanguageNeeded
	}
	var lastErr error
	for _, page := range imagePaths {
		script, err := detectScript(page)
		if err != nil {
			lastErr = err
			continue
		}
		langs, err := langsForDetectedScript(script)
		if err != nil {
			return "", err
		}
		log.Printf("[Extractor] OSD script=%s langs=%s", script, langs)
		return langs, nil
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", ErrOcrLanguageNeeded
}
