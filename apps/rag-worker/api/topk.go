package api

func ClampTopK(topK, defaultTopK int) int {
	if topK == 0 {
		topK = defaultTopK
	}
	if topK < 5 {
		return 5
	}
	if topK > 10 {
		return 10
	}
	return topK
}

// ClampChatTopK widens retrieve for map-then-answer chat (not /api/search).
func ClampChatTopK(topK, defaultTopK int) int {
	if topK == 0 {
		topK = defaultTopK
	}
	if topK < 10 {
		return 10
	}
	if topK > 40 {
		return 40
	}
	return topK
}
