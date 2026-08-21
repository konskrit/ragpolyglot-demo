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
	"unicode/utf8"
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
	if len(content) >= 3 && content[0] == 0xEF && content[1] == 0xBB && content[2] == 0xBF {
		return string(content[3:])
	}

	if len(content) >= 2 && content[0] == 0xFF && content[1] == 0xFE {
		return convertUTF16ToUTF8(content[2:], false)
	}

	if len(content) >= 2 && content[0] == 0xFE && content[1] == 0xFF {
		return convertUTF16ToUTF8(content[2:], true)
	}

	if utf8.Valid(content) {
		return string(content)
	}

	log.Printf("[Extractor] Content is not valid UTF-8, attempting cleanup")
	return sanitizeInvalidUTF8Bytes(string(content))
}

func convertUTF16ToUTF8(data []byte, bigEndian bool) string {
	var result strings.Builder
	for i := 0; i+1 < len(data); i += 2 {
		var code uint32
		if bigEndian {
			code = uint32(data[i])<<8 | uint32(data[i+1])
		} else {
			code = uint32(data[i+1])<<8 | uint32(data[i])
		}

		if code >= 0xD800 && code <= 0xDBFF && i+3 < len(data) {
			var low uint32
			if bigEndian {
				low = uint32(data[i+2])<<8 | uint32(data[i+3])
			} else {
				low = uint32(data[i+3])<<8 | uint32(data[i+2])
			}

			if low >= 0xDC00 && low <= 0xDFFF {
				code = 0x10000 + ((code-0xD800)<<10) + (low - 0xDC00)
				i++
			}
		}

		if code != 0xFFFD {
			result.WriteRune(rune(code))
		}
	}
	return result.String()
}

func sanitizeInvalidUTF8Bytes(s string) string {
	var buf strings.Builder
	for _, r := range s {
		if r != '\uFFFD' {
			buf.WriteRune(r)
		}
	}
	return buf.String()
}

func ensureValidUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	return sanitizeInvalidUTF8Bytes(s)
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
