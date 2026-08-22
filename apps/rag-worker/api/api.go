package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"apps/rag-worker/embedding"
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

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
