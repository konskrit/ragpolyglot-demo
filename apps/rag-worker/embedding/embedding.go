package embedding

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"time"

	"apps/rag-worker/models"
)

const (
	maxBatchSize = 64
	maxRetries   = 3
)

type Request struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type Response struct {
	Data []struct {
		Index     int       `json:"index"`
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

func GenerateAndAttach(textChunks []string, allowFallback bool) ([]models.TextChunk, error) {
	if len(textChunks) == 0 {
		return nil, fmt.Errorf("no chunks to embed")
	}

	apiKey := os.Getenv("OPENAI_API_KEY")
	apiURL := apiURL()
	usingDefaultOpenAI := apiURL == "https://api.openai.com/v1/embeddings"

	if apiKey == "" && usingDefaultOpenAI {
		if !allowFallback {
			return nil, fmt.Errorf("embedding API not configured")
		}
		log.Println("[Embedding] No API configured, using fallback embeddings")
		return fallbackEmbeddings(textChunks), nil
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		result, err := generateViaAPI(textChunks, apiKey, apiURL)
		if err == nil {
			return result, nil
		}
		lastErr = err
		log.Printf("[Embedding] Attempt %d/%d failed: %v", attempt, maxRetries, err)
		if attempt < maxRetries {
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}
	}

	if allowFallback && usingDefaultOpenAI && apiKey == "" {
		log.Printf("[Embedding] Falling back after API failures: %v", lastErr)
		return fallbackEmbeddings(textChunks), nil
	}

	return nil, fmt.Errorf("embedding failed after %d retries: %w", maxRetries, lastErr)
}

func generateViaAPI(textChunks []string, apiKey, apiURL string) ([]models.TextChunk, error) {
	var result []models.TextChunk

	for i := 0; i < len(textChunks); i += maxBatchSize {
		end := i + maxBatchSize
		if end > len(textChunks) {
			end = len(textChunks)
		}

		batch := textChunks[i:end]
		embeddings, err := callAPI(batch, apiKey, apiURL)
		if err != nil {
			return nil, err
		}

		for j, text := range batch {
			result = append(result, models.TextChunk{
				Text:      text,
				Embedding: embeddings[j],
			})
		}
	}

	return result, nil
}

func apiURL() string {
	if lm := os.Getenv("LMSTUDIO_API_URL"); lm != "" {
		return lm + "/embeddings"
	}
	if base := os.Getenv("OPENAI_API_BASE_URL"); base != "" {
		return base + "/embeddings"
	}
	return "https://api.openai.com/v1/embeddings"
}

func callAPI(texts []string, apiKey, apiURL string) ([][]float32, error) {
	model := os.Getenv("EMBEDDING_MODEL")
	if model == "" {
		model = "text-embedding-ada-002"
	}

	body, err := json.Marshal(Request{Model: model, Input: texts})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
	}

	var parsed Response
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	byIndex := make(map[int][]float32, len(parsed.Data))
	for _, item := range parsed.Data {
		byIndex[item.Index] = item.Embedding
	}

	out := make([][]float32, len(texts))
	for i := range texts {
		emb, ok := byIndex[i]
		if !ok {
			return nil, fmt.Errorf("missing embedding for index %d", i)
		}
		out[i] = emb
	}
	return out, nil
}

func EmbedQuery(query string, allowFallback bool) ([]float32, error) {
	chunks, err := GenerateAndAttach([]string{query}, allowFallback)
	if err != nil {
		return nil, err
	}
	return chunks[0].Embedding, nil
}

func fallbackEmbeddings(texts []string) []models.TextChunk {
	dim := embeddingDimension()
	out := make([]models.TextChunk, 0, len(texts))
	for _, text := range texts {
		out = append(out, models.TextChunk{
			Text:      text,
			Embedding: hashToVector(text, dim),
		})
	}
	return out
}

func embeddingDimension() int {
	if s := os.Getenv("EMBEDDING_DIMENSION"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			return n
		}
	}
	return 1536
}

func hashToVector(input string, dimensions int) []float32 {
	hash := sha256.Sum256([]byte(input))
	vec := make([]float32, dimensions)
	for i := 0; i < dimensions; i++ {
		byteIndex := (i * 4) % len(hash)
		val := float64(hash[byteIndex]) +
			float64(hash[(byteIndex+1)%len(hash)])*256 +
			float64(hash[(byteIndex+2)%len(hash)])*65536 +
			float64(hash[(byteIndex+3)%len(hash)])*16777216
		vec[i] = float32(math.Sin(val * 0.01))
	}
	return vec
}
