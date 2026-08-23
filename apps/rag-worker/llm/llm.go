package llm

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"
)

const (
	defaultOpenAIBase = "https://api.openai.com/v1"
	maxRetries        = 3
	noContextAnswer   = "I don't know based on the documents."
	systemPrompt      = "You are a retrieval-augmented assistant. Use ONLY the provided context.\n" +
		"If the answer is not in the context, say: \"I don't know based on the documents.\""
)

func Generate(ctx context.Context, query string, contextChunks []string) (string, error) {
	if len(contextChunks) == 0 {
		return noContextAnswer, nil
	}

	baseURL := chatBaseURL()
	apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	if baseURL == defaultOpenAIBase && apiKey == "" {
		return "", fmt.Errorf("LLM API not configured")
	}

	cfg := openai.DefaultConfig(apiKey)
	cfg.BaseURL = baseURL
	cfg.HTTPClient = &http.Client{Timeout: 120 * time.Second}
	client := openai.NewClientWithConfig(cfg)

	req := openai.ChatCompletionRequest{
		Model: modelName(),
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: userPrompt(query, contextChunks)},
		},
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		resp, err := client.CreateChatCompletion(ctx, req)
		if err == nil {
			if len(resp.Choices) == 0 || strings.TrimSpace(resp.Choices[0].Message.Content) == "" {
				lastErr = fmt.Errorf("empty LLM response")
			} else {
				return strings.TrimSpace(resp.Choices[0].Message.Content), nil
			}
		} else {
			lastErr = err
			log.Printf("[LLM] attempt %d/%d failed: %v", attempt, maxRetries, err)
			if attempt < maxRetries && retryable(err) {
				time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
				continue
			}
		}
		break
	}

	return "", fmt.Errorf("LLM failed after retries: %w", lastErr)
}

func userPrompt(query string, chunks []string) string {
	return fmt.Sprintf("Context:\n%s\n\nUser question:\n%s", strings.Join(chunks, "\n\n"), query)
}

func chatBaseURL() string {
	if lm := strings.TrimSpace(os.Getenv("LMSTUDIO_API_URL")); lm != "" {
		return strings.TrimRight(lm, "/")
	}
	if base := strings.TrimSpace(os.Getenv("OPENAI_API_BASE_URL")); base != "" {
		return strings.TrimRight(base, "/")
	}
	return defaultOpenAIBase
}

func modelName() string {
	if m := strings.TrimSpace(os.Getenv("LLM_MODEL")); m != "" {
		return m
	}
	if chatBaseURL() == defaultOpenAIBase {
		return "gpt-4o-mini"
	}
	return "local-model"
}

func retryable(err error) bool {
	var apiErr *openai.APIError
	if errors.As(err, &apiErr) {
		return apiErr.HTTPStatusCode == http.StatusTooManyRequests || apiErr.HTTPStatusCode >= 500
	}
	var reqErr *openai.RequestError
	if errors.As(err, &reqErr) {
		return reqErr.HTTPStatusCode == http.StatusTooManyRequests || reqErr.HTTPStatusCode >= 500
	}
	return true
}
