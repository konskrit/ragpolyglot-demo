package llm

import (
	"context"
	"errors"
	"fmt"
	"io"
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

// Generate returns the full LLM answer (non-streaming).
func Generate(ctx context.Context, query string, contextChunks []string) (string, error) {
	return GenerateStream(ctx, query, contextChunks, nil)
}

// GenerateStream streams tokens via onToken (may be nil) and returns the full answer.
func GenerateStream(ctx context.Context, query string, contextChunks []string, onToken func(string) error) (string, error) {
	if len(contextChunks) == 0 {
		if err := emitToken(onToken, noContextAnswer); err != nil {
			return "", err
		}
		return noContextAnswer, nil
	}

	model, err := modelName()
	if err != nil {
		return "", err
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
		Model: model,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: systemPrompt},
			{Role: openai.ChatMessageRoleUser, Content: userPrompt(query, contextChunks)},
		},
		Stream: true,
	}

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		answer, emitted, err := streamOnce(ctx, client, req, onToken)
		if err == nil {
			answer = strings.TrimSpace(answer)
			if answer == "" {
				lastErr = fmt.Errorf("empty LLM response")
				break
			}
			return answer, nil
		}

		lastErr = err
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return "", err
		}
		if emitted {
			// Do not retry after the client has already seen tokens.
			break
		}

		log.Printf("[LLM] stream attempt %d/%d failed: %v", attempt, maxRetries, err)
		if attempt < maxRetries && retryable(err) {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(time.Duration(attempt) * 500 * time.Millisecond):
			}
			continue
		}
		break
	}

	return "", fmt.Errorf("LLM failed after retries: %w", lastErr)
}

func streamOnce(
	ctx context.Context,
	client *openai.Client,
	req openai.ChatCompletionRequest,
	onToken func(string) error,
) (answer string, emitted bool, err error) {
	stream, err := client.CreateChatCompletionStream(ctx, req)
	if err != nil {
		return "", false, err
	}
	defer stream.Close()

	var b strings.Builder
	for {
		resp, recvErr := stream.Recv()
		if errors.Is(recvErr, io.EOF) {
			return b.String(), emitted, nil
		}
		if recvErr != nil {
			return b.String(), emitted, recvErr
		}
		if len(resp.Choices) == 0 {
			continue
		}
		tok := resp.Choices[0].Delta.Content
		if tok == "" {
			continue
		}
		if emitErr := emitToken(onToken, tok); emitErr != nil {
			return b.String(), true, emitErr
		}
		emitted = true
		b.WriteString(tok)
	}
}

func emitToken(onToken func(string) error, token string) error {
	if onToken == nil {
		return nil
	}
	return onToken(token)
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

func modelName() (string, error) {
	m := strings.TrimSpace(os.Getenv("LLM_MODEL"))
	if m == "" {
		return "", fmt.Errorf("LLM_MODEL not configured")
	}
	return m, nil
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
