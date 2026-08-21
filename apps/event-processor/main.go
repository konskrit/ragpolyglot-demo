package main

import (
	"context"
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
	rmq "apps/event-processor/rabbitmq"
	"apps/event-processor/storage"
)

func main() {
	log.Println("Event Processor starting...")
	cfg := config.Load()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("postgres ping: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	store := storage.New(pool)
	if err := store.EnsureSchema(ctx); err != nil {
		log.Fatalf("schema ensure: %v", err)
	}

	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("Redis unavailable, job locks/counters disabled: %v", err)
		_ = redisClient.Close()
		redisClient = nil
	} else {
		log.Println("Connected to Redis")
		defer redisClient.Close()
	}

	rabbitConn := rmq.Connect(cfg.RabbitMQURL)
	defer rabbitConn.Close()
	log.Println("Connected to RabbitMQ")

	setupCh := rmq.OpenChannel(rabbitConn)
	if err := rmq.SetupTopology(setupCh); err != nil {
		log.Fatalf("rabbitmq topology: %v", err)
	}
	_ = setupCh.Close()

	runner := jobs.NewRunner(store, redisClient, cfg.LogRetentionD)
	runner.Start(rabbitConn)

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
