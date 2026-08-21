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
	"md":       extractMarkdown,
	"markdown": extractMarkdown,
	"json":     extractJSON,
	"pdf":      extractPDF,
}

func ReadFile(filePath string) ([]byte, error) {
	possiblePaths := []string{
		filePath,
		filepath.Join("/uploads", filepath.Base(filePath)),
		filepath.Join("/app/uploads", filepath.Base(filePath)),
		strings.TrimPrefix(filePath, "/uploads/"),
	}

	for _, path := range possiblePaths {
		content, err := os.ReadFile(path)
		if err == nil {
			return content, nil
		}
		log.Printf("[Extractor] Failed to read from %s: %v", path, err)
	}

	return nil, fmt.Errorf("could not read file from any known path")
}

func ExtractText(content []byte, filePath string) string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filePath), "."))

	extractor, ok := extractors[ext]
	if !ok {
		log.Printf("[Extractor] Unsupported file type: %s, treating as plain text", ext)
		extractor = extractPlainText
	}

	text := extractor(content, filePath)

	return ensureValidUTF8(text)
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

	return ensureValidUTF8(string(decoded))
}

func ensureValidUTF8(s string) string {
	return strings.ToValidUTF8(s, "")
}

func extractPlainText(content []byte, filePath string) string {
	return detectAndConvertEncoding(content)
}

func extractMarkdown(content []byte, filePath string) string {
	return detectAndConvertEncoding(content)
}

func extractJSON(content []byte, filePath string) string {
	var data map[string]interface{}
	if err := json.Unmarshal(content, &data); err == nil {
		return formatJSONAsText(data)
	}
	log.Printf("[Extractor] Failed to parse JSON, treating as plain text")
	return detectAndConvertEncoding(content)
}

func extractPDF(content []byte, filePath string) string {
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
