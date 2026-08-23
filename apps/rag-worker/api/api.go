package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"apps/rag-worker/embedding"
	"apps/rag-worker/llm"
	"apps/rag-worker/models"
	"apps/rag-worker/storage"
)

type Server struct {
	store         *storage.Store
	defaultTopK   int
	allowFallback bool
}

func NewServer(store *storage.Store, defaultTopK int, allowFallback bool) *Server {
	return &Server{
		store:         store,
		defaultTopK:   defaultTopK,
		allowFallback: allowFallback,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("POST /api/search", s.search)
	mux.HandleFunc("POST /api/chat", s.chat)
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "healthy",
		"timestamp": time.Now().UTC(),
	})
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	var req models.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	if req.Query == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "query is required"})
		return
	}

	topK := ClampTopK(req.TopK, s.defaultTopK)

	vec, err := embedding.EmbedQuery(req.Query, s.allowFallback)
	if err != nil {
		log.Printf("[API] embed query failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "embedding failed"})
		return
	}

	hits, err := s.store.SearchSimilar(r.Context(), vec, topK)
	if err != nil {
		log.Printf("[API] vector search failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "search failed"})
		return
	}

	duration := time.Since(start)
	s.store.LogQuery(r.Context(), req.Query, topK, len(hits), duration)
	s.store.LogSystem(r.Context(), "vector_search", "", duration, map[string]any{
		"topK":        topK,
		"resultCount": len(hits),
	})

	writeJSON(w, http.StatusOK, models.SearchResponse{
		Query:   req.Query,
		TopK:    topK,
		Results: hits,
	})
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	var req models.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	if req.Query == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "query is required"})
		return
	}

	topK := ClampTopK(req.TopK, s.defaultTopK)

	vec, err := embedding.EmbedQuery(req.Query, s.allowFallback)
	if err != nil {
		log.Printf("[API] chat embed failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "embedding failed"})
		return
	}

	hits, err := s.store.SearchSimilar(ctx, vec, topK)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("[API] chat search failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "search failed"})
		return
	}

	chunkTexts := make([]string, 0, len(hits))
	for _, h := range hits {
		if t := strings.TrimSpace(h.Content); t != "" {
			chunkTexts = append(chunkTexts, t)
		}
	}

	answer, err := llm.Generate(ctx, req.Query, chunkTexts)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("[API] chat generate failed: %v", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "llm unavailable"})
		return
	}

	duration := time.Since(start)
	s.store.LogQuery(ctx, req.Query, topK, len(hits), duration)
	s.store.LogSystem(ctx, "rag_chat", "", duration, map[string]any{
		"topK":        topK,
		"resultCount": len(hits),
	})

	writeJSON(w, http.StatusOK, models.ChatResponse{
		Query:   req.Query,
		TopK:    topK,
		Answer:  answer,
		Sources: hits,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
