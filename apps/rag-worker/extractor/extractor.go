package extractor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

const (
	defaultMaxExtractedChars = 10_000_000
	defaultMaxChunks         = 5000
)

type textExtractor func([]byte) string

var extractors = map[string]textExtractor{
	"txt":      extractPlainText,
	"md":       extractPlainText,
	"markdown": extractPlainText,
	"json":     extractJSON,
}

func MaxChunks() int {
	return envInt("MAX_CHUNKS", defaultMaxChunks)
}

func ExtractFromPath(filePath, ocrLang string) (string, error) {
	text, _, err := ExtractFromPathWithOCR(filePath, ocrLang, OCRState{})
	return text, err
}

func ExtractFromPathWithOCR(filePath, ocrLang string, state OCRState) (text string, resolved string, err error) {
	fullPath, err := resolveUploadPath(filePath)
	if err != nil {
		return "", "", err
	}

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filePath), "."))
	if ext == "pdf" {
		return extractPDF(fullPath, ocrLang, state)
	}

	extract := extractors[ext]
	if extract == nil {
		log.Printf("[Extractor] Unsupported file type: %s, treating as plain text", ext)
		extract = extractPlainText
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", "", fmt.Errorf("could not read upload %q: %w", filepath.Base(fullPath), err)
	}

	out := trimToLimit(ensureValidUTF8(extract(content)))
	if out == "" {
		return "", "", fmt.Errorf("no text extracted")
	}
	return out, "", nil
}

func envInt(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func maxExtractedChars() int {
	return envInt("MAX_EXTRACTED_CHARS", defaultMaxExtractedChars)
}

func resolveUploadPath(filePath string) (string, error) {
	name := filepath.Base(filepath.Clean(filePath))
	if name == "." || name == ".." || name == "" || name == string(filepath.Separator) {
		return "", fmt.Errorf("invalid file name")
	}

	root := uploadRoot()
	full := filepath.Join(root, name)
	if !isInsideRoot(root, full) {
		return "", fmt.Errorf("could not read upload %q", name)
	}
	return full, nil
}

func uploadRoot() string {
	if v := strings.TrimSpace(os.Getenv("UPLOADS_DIR")); v != "" {
		return v
	}
	return "/uploads"
}

func isInsideRoot(root, candidate string) bool {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absRoot, absCandidate)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func trimToLimit(text string) string {
	limit := maxExtractedChars()
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit])
}

func detectAndConvertEncoding(content []byte) string {
	if len(content) == 0 {
		return ""
	}

	decoded, _, err := transform.Bytes(unicode.BOMOverride(unicode.UTF8.NewDecoder()), content)
	if err != nil {
		log.Printf("[Extractor] Encoding conversion failed: %v", err)
		return strings.ToValidUTF8(string(content), "")
	}

	return string(decoded)
}

func ensureValidUTF8(s string) string {
	return strings.ToValidUTF8(s, "")
}

func extractPlainText(content []byte) string {
	return detectAndConvertEncoding(content)
}

func extractJSON(content []byte) string {
	var data map[string]interface{}
	if err := json.Unmarshal(content, &data); err == nil {
		return formatJSONAsText(data)
	}
	log.Printf("[Extractor] Failed to parse JSON, treating as plain text")
	return detectAndConvertEncoding(content)
}

func extractPDF(path, ocrLang string, state OCRState) (string, string, error) {
	resume := state.StartPage > 1 || strings.TrimSpace(state.PriorText) != "" || strings.TrimSpace(state.Resolved) != ""
	if resume || strings.TrimSpace(ocrLang) != "" {
		log.Println("[Extractor] Running OCR")
		return extractPDFWithOCR(path, ocrLang, state)
	}

	native, err := pdftotext(path)
	if err != nil {
		log.Printf("[Extractor] pdftotext failed, trying OCR: %v", err)
		return extractPDFWithOCR(path, ocrLang, state)
	}
	if hasEnoughText(native) {
		return trimToLimit(strings.TrimSpace(native)), "", nil
	}
	log.Println("[Extractor] PDF has little native text, running OCR")
	return extractPDFWithOCR(path, ocrLang, state)
}

func pdftotext(path string) (string, error) {
	cmd := exec.Command("pdftotext", "-layout", path, "-")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("pdftotext failed: %w (stderr: %s)", err, stderr.String())
	}
	return stdout.String(), nil
}

func formatJSONAsText(data map[string]interface{}) string {
	var buf strings.Builder
	for key, value := range data {
		switch v := value.(type) {
		case string:
			buf.WriteString(fmt.Sprintf("%s: %s\n", key, v))
		case float64:
			buf.WriteString(fmt.Sprintf("%s: %.2f\n", key, v))
		case bool:
			buf.WriteString(fmt.Sprintf("%s: %t\n", key, v))
		case map[string]interface{}:
			buf.WriteString(fmt.Sprintf("%s:\n%s\n", key, formatJSONAsText(v)))
		case []interface{}:
			buf.WriteString(fmt.Sprintf("%s:\n", key))
			for _, item := range v {
				if str, ok := item.(string); ok {
					buf.WriteString(fmt.Sprintf("- %s\n", str))
				} else if m, ok := item.(map[string]interface{}); ok {
					buf.WriteString(formatJSONAsText(m))
				}
			}
		default:
			buf.WriteString(fmt.Sprintf("%s: %v\n", key, v))
		}
	}
	return buf.String()
}
