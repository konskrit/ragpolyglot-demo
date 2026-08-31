package chunker

import "strings"

const (
	charsPerToken = 4
	targetTokens  = 750
	overlapRatio  = 0.10
)

func ChunkText(text string) []string {
	text = normalizeWhitespace(text)
	if text == "" {
		return nil
	}

	chunkSize := targetTokens * charsPerToken
	overlap := int(float64(chunkSize) * overlapRatio)
	if overlap < 1 {
		overlap = 1
	}

	runes := []rune(text)
	if len(runes) <= chunkSize {
		return []string{string(runes)}
	}

	var chunks []string
	start := 0

	for start < len(runes) {
		end := start + chunkSize
		if end >= len(runes) {
			chunk := strings.TrimSpace(string(runes[start:]))
			if chunk != "" {
				chunks = append(chunks, chunk)
			}
			break
		}

		breakPoint := findBreakPoint(runes, start+overlap, end)
		if breakPoint <= start {
			breakPoint = end
		}

		chunk := strings.TrimSpace(string(runes[start:breakPoint]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}

		prevStart := start
		start = breakPoint - overlap
		if start < 0 {
			start = 0
		}
		if start >= breakPoint {
			start = breakPoint
		}
		if chunk == "" && start <= prevStart {
			if end >= len(runes) {
				break
			}
			start = end
		}
	}

	return chunks
}

func normalizeWhitespace(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	var lines []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return strings.Join(lines, " ")
}

func findBreakPoint(runes []rune, minPos, maxPos int) int {
	if maxPos > len(runes) {
		maxPos = len(runes)
	}
	if minPos < 0 {
		minPos = 0
	}

	for i := maxPos - 1; i >= minPos; i-- {
		if runes[i] == '\n' {
			return i + 1
		}
	}

	for i := maxPos - 1; i >= minPos; i-- {
		if (runes[i] == '.' || runes[i] == '!' || runes[i] == '?') && i+1 < len(runes) && runes[i+1] == ' ' {
			return i + 2
		}
	}

	for i := maxPos - 1; i >= minPos; i-- {
		if runes[i] == ' ' {
			return i + 1
		}
	}

	return maxPos
}
