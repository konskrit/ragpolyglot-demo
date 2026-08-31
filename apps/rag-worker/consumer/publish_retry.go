package consumer

import (
	"log"
	"time"
)

const (
	publishMaxAttempts = 12
	publishRetryBase   = 250 * time.Millisecond
)

func publishWithRetry(label string, fn func() error) error {
	var lastErr error
	for attempt := 1; attempt <= publishMaxAttempts; attempt++ {
		if err := fn(); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt < publishMaxAttempts {
			delay := publishRetryBase * time.Duration(attempt)
			log.Printf("[Consumer] %s publish attempt %d/%d failed: %v; retry in %s", label, attempt, publishMaxAttempts, lastErr, delay)
			time.Sleep(delay)
		}
	}
	return lastErr
}
