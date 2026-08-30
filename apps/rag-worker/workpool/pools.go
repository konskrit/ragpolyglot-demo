package workpool

import "log"

type Pools struct {
	OCR   *Pool
	Embed *Pool
}

func NewPools() *Pools {
	ocrSlots := OCRPoolSlots()
	embedSlots := EmbedPoolSlots()
	p := &Pools{
		OCR:   NewWithConfig(ocrSlots, memoryBudgetBytes(), "ocr"),
		Embed: NewWithConfig(embedSlots, embedMemoryBudgetBytes(), "embed"),
	}
	log.Printf("[WorkPool] ocrSlots=%d embedSlots=%d ocrPage=%dMB ocrMem=%dMB embedBatch=%dMB embedMem=%dMB fastIngest=%d ocrIngest=%d rabbitPrefetch=%d",
		ocrSlots, embedSlots,
		OCRPageMemory()/(1024*1024), memoryBudgetBytes()/(1024*1024),
		EmbedBatchMemory()/(1024*1024), embedMemoryBudgetBytes()/(1024*1024),
		FastIngestPrefetch(), OCRIngestPrefetch(), RabbitPrefetch())
	return p
}
