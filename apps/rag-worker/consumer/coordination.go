package consumer

import (
	"context"
	"strconv"

	"github.com/redis/go-redis/v9"
)

const (
	redisPauseKeyPrefix   = "ingest:pause:"
	redisDeletedKeyPrefix = "ingest:deleted:"
	redisGenKeyPrefix     = "ingest:gen:"
)

func (p *Processor) setPause(documentID string, requested bool) {
	if p.redis != nil {
		ctx := context.Background()
		key := redisPauseKeyPrefix + documentID
		if requested {
			_ = p.redis.Set(ctx, key, "1", 0).Err()
		} else {
			_ = p.redis.Del(ctx, key).Err()
		}
	}

	p.pauseMu.Lock()
	defer p.pauseMu.Unlock()
	if requested {
		p.pauseRequested[documentID] = struct{}{}
		return
	}
	delete(p.pauseRequested, documentID)
}

func (p *Processor) pauseRequestedFor(documentID string) bool {
	if p.redis != nil {
		ctx := context.Background()
		n, err := p.redis.Exists(ctx, redisPauseKeyPrefix+documentID).Result()
		if err == nil && n > 0 {
			return true
		}
	}

	p.pauseMu.Lock()
	defer p.pauseMu.Unlock()
	_, ok := p.pauseRequested[documentID]
	return ok
}

func (p *Processor) setDeleted(documentID string, deleted bool) {
	if p.redis != nil {
		ctx := context.Background()
		key := redisDeletedKeyPrefix + documentID
		if deleted {
			_ = p.redis.Set(ctx, key, "1", 0).Err()
		} else {
			_ = p.redis.Del(ctx, key).Err()
		}
	}

	p.deletedMu.Lock()
	defer p.deletedMu.Unlock()
	if deleted {
		p.deletedRequested[documentID] = struct{}{}
		return
	}
	delete(p.deletedRequested, documentID)
}

func (p *Processor) deletedRequestedFor(documentID string) bool {
	if p.redis != nil {
		ctx := context.Background()
		n, err := p.redis.Exists(ctx, redisDeletedKeyPrefix+documentID).Result()
		if err == nil && n > 0 {
			return true
		}
	}

	p.deletedMu.Lock()
	defer p.deletedMu.Unlock()
	_, ok := p.deletedRequested[documentID]
	return ok
}

func (p *Processor) nextIngestGen(documentID string) uint64 {
	if p.redis != nil {
		ctx := context.Background()
		n, err := p.redis.Incr(ctx, redisGenKeyPrefix+documentID).Result()
		if err == nil {
			gen := uint64(n)
			p.setLocalIngestGen(documentID, gen)
			return gen
		}
	}

	p.ingestGenMu.Lock()
	defer p.ingestGenMu.Unlock()
	p.ingestGen[documentID]++
	return p.ingestGen[documentID]
}

func (p *Processor) isIngestStale(documentID string, gen uint64) bool {
	if p.redis != nil {
		ctx := context.Background()
		raw, err := p.redis.Get(ctx, redisGenKeyPrefix+documentID).Result()
		if err == redis.Nil {
			return gen != 0
		}
		if err == nil {
			current, parseErr := strconv.ParseUint(raw, 10, 64)
			if parseErr == nil {
				return current != gen
			}
		}
	}

	p.ingestGenMu.Lock()
	defer p.ingestGenMu.Unlock()
	return p.ingestGen[documentID] != gen
}

func (p *Processor) setLocalIngestGen(documentID string, gen uint64) {
	p.ingestGenMu.Lock()
	defer p.ingestGenMu.Unlock()
	p.ingestGen[documentID] = gen
}

func (p *Processor) shouldStopIngest(documentID string, gen uint64) bool {
	return p.pauseRequestedFor(documentID) || p.deletedRequestedFor(documentID) || p.isIngestStale(documentID, gen)
}
