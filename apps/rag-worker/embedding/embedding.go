package embedding

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"apps/rag-worker/models"
)

const (
	maxBatchSize      = 64
	maxRetries        = 3
	defaultModel      = "text-embedding-ada-002"
	defaultDimension  = 1536
	defaultOpenAIURL  = "https://api.openai.com/v1/embeddings"
	httpClientTimeout = 30 * time.Second
)

var httpClient = &http.Client{Timeout: httpClientTimeout}

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
	endpoint := apiURL()
	needsOpenAIKey := endpoint == defaultOpenAIURL

	// Local/demo path: no cloud key and no custom endpoint → deterministic hash vectors.
	if apiKey == "" && needsOpenAIKey {
		if !allowFallback {
			return nil, fmt.Errorf("embedding API not configured")
		}
		log.Println("[Embedding] No API configured, using fallback embeddings")
		return fallbackEmbeddings(textChunks), nil
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		result, err := generateViaAPI(textChunks, apiKey, endpoint)
		if err == nil {
			return result, nil
		}
		lastErr = err
		log.Printf("[Embedding] Attempt %d/%d failed: %v", attempt, maxRetries, err)
		if attempt < maxRetries && retryable(err) {
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
			continue
		}
		break
	}

	if allowFallback {
		log.Printf("[Embedding] API failed (%v), using fallback embeddings", lastErr)
		return fallbackEmbeddings(textChunks), nil
	}

	return nil, fmt.Errorf("embedding failed after retries: %w", lastErr)
}

func generateViaAPI(textChunks []string, apiKey, endpoint string) ([]models.TextChunk, error) {
	result := make([]models.TextChunk, 0, len(textChunks))

	for i := 0; i < len(textChunks); i += maxBatchSize {
		end := min(i+maxBatchSize, len(textChunks))
		batch := textChunks[i:end]

		embeddings, err := callAPI(batch, apiKey, endpoint)
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
	if lm := strings.TrimSpace(os.Getenv("LMSTUDIO_API_URL")); lm != "" {
		return joinEmbeddingsURL(lm)
	}
	if base := strings.TrimSpace(os.Getenv("OPENAI_API_BASE_URL")); base != "" {
		return joinEmbeddingsURL(base)
	}
	return defaultOpenAIURL
}

func joinEmbeddingsURL(base string) string {
	base = strings.TrimRight(base, "/")
	u, err := url.Parse(base)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return base + "/embeddings"
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/embeddings"
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}

func callAPI(texts []string, apiKey, endpoint string) ([][]float32, error) {
	model := os.Getenv("EMBEDDING_MODEL")
	if model == "" {
		model = defaultModel
	}

	body, err := json.Marshal(Request{Model: model, Input: texts})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, &httpStatusError{code: resp.StatusCode, body: string(b)}
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
	expectedDim := embeddingDimension()
	for i := range texts {
		emb, ok := byIndex[i]
		if !ok {
			return nil, fmt.Errorf("missing embedding for index %d", i)
		}
		if len(emb) != expectedDim {
			return nil, fmt.Errorf(
				"embedding dimension mismatch at index %d: got %d, EMBEDDING_DIMENSION=%d",
				i, len(emb), expectedDim,
			)
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
	return defaultDimension
}

// hashToVector builds a deterministic unit-ish vector for local/dev when no
// embedding API is configured. Not semantically meaningful — only for pipeline demos.
func hashToVector(input string, dimensions int) []float32 {
	vec := make([]float32, dimensions)
	seed := []byte(input)
	var digest [sha256.Size]byte
	var counter [4]byte
	offset := sha256.Size

	for i := 0; i < dimensions; i++ {
		if offset+4 > sha256.Size {
			binary.BigEndian.PutUint32(counter[:], uint32(i))
			h := sha256.New()
			_, _ = h.Write(seed)
			_, _ = h.Write(counter[:])
			h.Sum(digest[:0])
			offset = 0
		}
		bits := binary.BigEndian.Uint32(digest[offset : offset+4])
		offset += 4
		// Map uint32 into [-1, 1].
		vec[i] = float32(bits)/float32(math.MaxUint32)*2 - 1
	}

	return l2Normalize(vec)
}

func l2Normalize(vec []float32) []float32 {
	var sum float64
	for _, v := range vec {
		sum += float64(v) * float64(v)
	}
	if sum == 0 {
		return vec
	}
	inv := float32(1 / math.Sqrt(sum))
	for i := range vec {
		vec[i] *= inv
	}
	return vec
}

type httpStatusError struct {
	code int
	body string
}

func (e *httpStatusError) Error() string {
	return fmt.Sprintf("status %d: %s", e.code, e.body)
}

func retryable(err error) bool {
	var statusErr *httpStatusError
	if errors.As(err, &statusErr) {
		return statusErr.code == http.StatusTooManyRequests || statusErr.code >= 500
	}
	return true
}
