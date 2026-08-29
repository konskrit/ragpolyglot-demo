package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"apps/event-processor/api"
	"apps/event-processor/config"
	"apps/event-processor/jobs"
	"apps/event-processor/storage"
)

func main() {
	log.Println("Event Processor starting...")
	cfg := config.Load()
	ctx := context.Background()

	pool, err := openPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()
	log.Println("Connected to PostgreSQL")

	store := storage.New(pool)
	if err := store.EnsureSchema(ctx); err != nil {
		log.Fatalf("schema ensure: %v", err)
	}

	redisClient := redis.NewClient(cfg.RedisOpts)
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("Redis unavailable, job locks/counters disabled: %v", err)
		_ = redisClient.Close()
		redisClient = nil
	} else {
		log.Println("Connected to Redis")
		defer redisClient.Close()
	}

	runner := jobs.NewRunner(store, redisClient, cfg)
	runner.Start(cfg.RabbitMQURL)

	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewServer(store).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("HTTP listening on %s", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

func openPostgres(parent context.Context, url string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	var lastErr error
	for {
		pool, err := pgxpool.New(ctx, url)
		if err != nil {
			lastErr = err
		} else if err = pool.Ping(ctx); err != nil {
			lastErr = err
			pool.Close()
		} else {
			return pool, nil
		}

		select {
		case <-ctx.Done():
			if lastErr == nil {
				lastErr = ctx.Err()
			}
			return nil, fmt.Errorf("postgres unavailable: %w", lastErr)
		case <-ticker.C:
		}
	}
}
