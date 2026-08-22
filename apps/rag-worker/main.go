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

	"apps/rag-worker/api"
	"apps/rag-worker/config"
	"apps/rag-worker/consumer"
	"apps/rag-worker/publisher"
	rmq "apps/rag-worker/rabbitmq"
	"apps/rag-worker/storage"
)

func main() {
	log.Println("RAG Worker starting...")
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

	redisClient := redis.NewClient(cfg.RedisOpts)
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("Redis unavailable, continuing without cache counters: %v", err)
		redisClient = nil
	} else {
		log.Println("Connected to Redis")
	}
	if redisClient != nil {
		defer redisClient.Close()
	}

	rabbitConn := rmq.Connect(cfg.RabbitMQURL)
	defer rabbitConn.Close()
	log.Println("Connected to RabbitMQ")

	pubCh, err := rmq.OpenChannel(rabbitConn)
	if err != nil {
		log.Fatalf("rabbitmq: %v", err)
	}
	defer pubCh.Close()

	if err := rmq.SetupTopology(pubCh); err != nil {
		log.Fatalf("rabbitmq topology: %v", err)
	}

	pub := publisher.New(pubCh)

	proc := consumer.NewProcessor(store, pub, redisClient, cfg.EmbeddingFallback)
	consumer.Start(cfg.RabbitMQURL, proc)

	server := api.NewServer(store, cfg.DefaultTopK, cfg.EmbeddingFallback)
	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           server.Handler(),
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
