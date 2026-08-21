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
