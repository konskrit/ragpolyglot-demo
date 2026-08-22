package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

type Config struct {
	DatabaseURL       string
	RedisOpts         *redis.Options
	RabbitMQURL       string
	HTTPAddr          string
	DefaultTopK       int
	EmbeddingFallback bool
}

func Load() *Config {
	_ = godotenv.Load(".env", "../../.env")

	redisOpts, err := loadRedisOptions()
	if err != nil {
		panic(fmt.Sprintf("redis config: %v", err))
	}

	return &Config{
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/app_db?sslmode=disable"),
		RedisOpts:         redisOpts,
		RabbitMQURL:       getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		HTTPAddr:          getEnv("RAG_WORKER_HTTP_ADDR", ":8081"),
		DefaultTopK:       getEnvInt("RAG_TOP_K", 5),
		EmbeddingFallback: getEnvBool("EMBEDDING_FALLBACK", true),
	}
}

func loadRedisOptions() (*redis.Options, error) {
	if v := os.Getenv("REDIS_ADDR"); v != "" {
		return &redis.Options{Addr: v}, nil
	}
	raw := getEnv("REDIS_URL", "redis://localhost:6379")
	if strings.Contains(raw, "://") {
		return redis.ParseURL(raw)
	}
	return &redis.Options{Addr: raw}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return fallback
}
