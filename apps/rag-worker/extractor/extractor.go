package extractor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

type TextExtractor func(content []byte, filePath string) string

var extractors = map[string]TextExtractor{
	"txt":      extractPlainText,
	"md":       extractPlainText,
	"markdown": extractPlainText,
	"json":     extractJSON,
	"pdf":      extractPDF,
}

func ReadFile(filePath string) ([]byte, error) {
	name := filepath.Base(filepath.Clean(filePath))
	if name == "." || name == ".." || name == "" || name == string(filepath.Separator) {
		return nil, fmt.Errorf("invalid file name")
	}

	root := uploadRoot()
	full := filepath.Join(root, name)
	if !isInsideRoot(root, full) {
		return nil, fmt.Errorf("could not read upload %q", name)
	}

	content, err := os.ReadFile(full)
	if err != nil {
		return nil, fmt.Errorf("could not read upload %q: %w", name, err)
	}
	return content, nil
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

func ExtractText(content []byte, filePath string) string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filePath), "."))

	extract, ok := extractors[ext]
	if !ok {
		log.Printf("[Extractor] Unsupported file type: %s, treating as plain text", ext)
		extract = extractPlainText
	}

	return ensureValidUTF8(extract(content, filePath))
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

func extractPlainText(content []byte, _ string) string {
	return detectAndConvertEncoding(content)
}

func extractJSON(content []byte, _ string) string {
	var data map[string]interface{}
	if err := json.Unmarshal(content, &data); err == nil {
		return formatJSONAsText(data)
	}
	log.Printf("[Extractor] Failed to parse JSON, treating as plain text")
	return detectAndConvertEncoding(content)
}

func extractPDF(content []byte, _ string) string {
	tmpFile, err := os.CreateTemp("", "pdf-*.pdf")
	if err != nil {
		log.Printf("[Extractor] Failed to create temp file: %v", err)
		return ""
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.Write(content); err != nil {
		log.Printf("[Extractor] Failed to write temp file: %v", err)
		tmpFile.Close()
		return ""
	}
	tmpFile.Close()

	cmd := exec.Command("pdftotext", "-layout", tmpFile.Name(), "-")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("[Extractor] pdftotext failed: %v (stderr: %s)", err, stderr.String())
		return ""
	}

	text := strings.TrimSpace(stdout.String())
	if text == "" {
		log.Println("[Extractor] No text extracted from PDF")
	}

	return text
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
