package config

import (
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL       string
	RedisAddr         string
	RabbitMQURL       string
	HTTPAddr          string
	OpenAIAPIKey      string
	EmbeddingModel    string
	DefaultTopK       int
	EmbeddingFallback bool
}

func Load() *Config {
	_ = godotenv.Load(".env", "../../.env")

	return &Config{
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/app_db?sslmode=disable"),
		RedisAddr:         redisAddr(),
		RabbitMQURL:       getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		HTTPAddr:          getEnv("RAG_WORKER_HTTP_ADDR", ":8081"),
		OpenAIAPIKey:      os.Getenv("OPENAI_API_KEY"),
		EmbeddingModel:    getEnv("EMBEDDING_MODEL", "text-embedding-ada-002"),
		DefaultTopK:       getEnvInt("RAG_TOP_K", 5),
		EmbeddingFallback: getEnvBool("EMBEDDING_FALLBACK", true),
	}
}

func redisAddr() string {
	if v := os.Getenv("REDIS_ADDR"); v != "" {
		return v
	}
	raw := getEnv("REDIS_URL", "localhost:6379")
	raw = strings.TrimPrefix(raw, "redis://")
	raw = strings.TrimPrefix(raw, "rediss://")
	if i := strings.IndexByte(raw, '/'); i >= 0 {
		raw = raw[:i]
	}
	return raw
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
