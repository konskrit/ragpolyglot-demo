package workpool

import (
	"errors"
	"log"
	"sync"
	"time"
)

var ErrStopped = errors.New("stopped")

const waitPoll = 25 * time.Millisecond

type Pool struct {
	maxSlots  int
	memBudget int64
	mu        sync.Mutex
	active    int
	memUsed   int64
}

func New() *Pool {
	p := &Pool{
		maxSlots:  cpuSlots(),
		memBudget: memoryBudgetBytes(),
	}
	if p.memBudget < OCRPageMemory() {
		log.Printf("[WorkPool] warning: memory budget %dMB is below one OCR page (%dMB); raise WORK_MEMORY_BUDGET_MB",
			p.memBudget/(1024*1024), OCRPageMemory()/(1024*1024))
	}
	log.Printf("[WorkPool] slots=%d memoryBudget=%dMB ocrPage=%dMB embedBatch=%dMB",
		p.maxSlots, p.memBudget/(1024*1024),
		OCRPageMemory()/(1024*1024), EmbedBatchMemory()/(1024*1024))
	return p
}

func (p *Pool) Slots() int {
	if p == nil {
		return 1
	}
	return p.maxSlots
}

func (p *Pool) MemoryBudget() int64 {
	if p == nil {
		return 0
	}
	return p.memBudget
}

func (p *Pool) Run(mem int64, fn func() error) error {
	return p.RunWhile(mem, nil, fn)
}

func (p *Pool) RunWhile(mem int64, stop func() bool, fn func() error) error {
	if p == nil {
		return fn()
	}
	if mem <= 0 {
		mem = 1
	}

	p.mu.Lock()
	for p.active >= p.maxSlots || p.memUsed+mem > p.memBudget {
		if stop != nil && stop() {
			p.mu.Unlock()
			return ErrStopped
		}
		p.mu.Unlock()
		time.Sleep(waitPoll)
		p.mu.Lock()
	}
	p.active++
	p.memUsed += mem
	p.mu.Unlock()

	defer func() {
		p.mu.Lock()
		p.active--
		p.memUsed -= mem
		p.mu.Unlock()
	}()

	return fn()
}
