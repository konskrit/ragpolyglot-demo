package extractor

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"apps/rag-worker/workpool"
)

var (
	errKrakenUnavailable = errors.New("kraken unavailable")
	krakenGPUMu          sync.Mutex
)

func usesKraken(langs string) bool {
	switch strings.ToLower(strings.TrimSpace(langs)) {
	case "grc", "ancient_greek":
		return true
	default:
		return false
	}
}

func ocrEngine(langs string) string {
	if usesKraken(langs) {
		return "kraken"
	}
	return "tesseract"
}

func krakenModelPath() string {
	candidates := []string{
		strings.TrimSpace(os.Getenv("KRAKEN_GRC_MODEL")),
		"/models/grc.mlmodel",
	}
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

func ocrPagesKraken(pdfPath, dir string, start, total int, langs, prior, ocrLang string, stop func() bool, state OCRState) (string, string, error) {
	pageText := make([]string, total+1)
	mem := krakenPageMemory()
	lastDone := start - 1

	lineBatchLabel := "default"
	if n, ok := krakenLineBatch(); ok {
		lineBatchLabel = strconv.Itoa(n)
	}
	lineWorkersLabel := "default"
	if n, ok := krakenLineWorkers(); ok {
		lineWorkersLabel = strconv.Itoa(n)
	}
	precision := krakenPrecision()
	if precision == "" {
		precision = "default"
	}
	log.Printf(
		"[Extractor] OCR engine=kraken device=%s batch=%d threads=%d precision=%s line_batch=%s line_workers=%s vram_budget_mb=%d pages=%d",
		resolveKrakenDevice(),
		effectiveKrakenBatchSize(),
		krakenThreads(),
		precision,
		lineBatchLabel,
		lineWorkersLabel,
		krakenVRAMBudgetMB(),
		total-start+1,
	)

	for batchStart := start; batchStart <= total; {
		if stop != nil && stop() {
			return joinPageText(prior, pageText, start, lastDone), langs, ErrPaused
		}
		batchSize := effectiveKrakenBatchSize()
		batchEnd := batchStart + batchSize - 1
		if batchEnd > total {
			batchEnd = total
		}
		pages := make([]int, 0, batchEnd-batchStart+1)
		images := make([]string, 0, batchEnd-batchStart+1)

		renderStart := time.Now()
		err := state.Pool.RunWhile(mem, stop, func() error {
			for page := batchStart; page <= batchEnd; page++ {
				if stop != nil && stop() {
					return ErrPaused
				}
				log.Printf("[Extractor] OCR engine=kraken page %d langs=%s", page, langs)
				img, err := renderPDFPage(pdfPath, page, filepath.Join(dir, fmt.Sprintf("page-%d", page)), stop)
				if err != nil {
					return err
				}
				pages = append(pages, page)
				images = append(images, img)
			}
			return nil
		})
		if err != nil {
			removeFiles(images)
			if errors.Is(err, ErrPaused) || errors.Is(err, workpool.ErrStopped) {
				return joinPageText(prior, pageText, start, lastDone), langs, ErrPaused
			}
			return "", langs, err
		}
		log.Printf(
			"[Extractor] OCR engine=kraken rendered pages %d-%d in %s",
			batchStart, batchEnd, time.Since(renderStart).Round(time.Millisecond),
		)

		ocrStart := time.Now()
		texts, err := krakenPages(images, stop)
		if err != nil {
			if errors.Is(err, ErrPaused) {
				removeFiles(images)
				return joinPageText(prior, pageText, start, lastDone), langs, ErrPaused
			}
			if errors.Is(err, errKrakenUnavailable) {
				log.Printf("[Extractor] OCR engine=tesseract fallback langs=%s", langs)
				for i, page := range pages {
					text, tessErr := tesseractPage(images[i], langs, stop)
					if tessErr != nil {
						removeFiles(images)
						return joinPageText(prior, pageText, start, lastDone), langs, tessErr
					}
					pageText[page] = text
					lastDone = page
				}
				removeFiles(images)
				soFar := joinPageText(prior, pageText, start, lastDone)
				log.Printf("[Extractor] OCR engine=tesseract progress %d/%d", lastDone, total)
				if state.OnProgress != nil {
					if progErr := state.OnProgress(lastDone, total, soFar, langs); progErr != nil {
						return soFar, langs, progErr
					}
				}
				batchStart = batchEnd + 1
				continue
			}
			removeFiles(images)
			return "", langs, err
		}
		log.Printf(
			"[Extractor] OCR engine=kraken ocr pages %d-%d device=%s duration=%s",
			batchStart, batchEnd, resolveKrakenDevice(), time.Since(ocrStart).Round(time.Millisecond),
		)
		removeFiles(images)

		for i, page := range pages {
			pageText[page] = texts[i]
			lastDone = page
		}
		soFar := joinPageText(prior, pageText, start, lastDone)
		log.Printf("[Extractor] OCR engine=kraken progress %d/%d", lastDone, total)
		if state.OnProgress != nil {
			if err := state.OnProgress(lastDone, total, soFar, langs); err != nil {
				return joinPageText(prior, pageText, start, lastDone), langs, err
			}
		}
		batchStart = batchEnd + 1
	}

	return finishOCRText(joinPageText(prior, pageText, start, total), langs, state.Resolved, ocrLang)
}

func krakenCLIArgs(device string, imagePaths []string, model string) []string {
	args := []string{"--device", device, "--threads", strconv.Itoa(krakenThreads())}
	if precision := krakenPrecision(); precision != "" {
		args = append(args, "--precision", precision)
	}
	for _, imagePath := range imagePaths {
		args = append(args, "-i", imagePath, imagePath+".txt")
	}
	args = append(args, "segment", "-bl", "ocr", "-m", model)
	if lineBatch, ok := krakenLineBatch(); ok {
		args = append(args, "-B", strconv.Itoa(lineBatch))
	}
	if lineWorkers, ok := krakenLineWorkers(); ok {
		args = append(args, "--num-line-workers", strconv.Itoa(lineWorkers))
	}
	return args
}

func krakenOutputPaths(imagePaths []string) []string {
	out := make([]string, len(imagePaths))
	for i, imagePath := range imagePaths {
		out[i] = imagePath + ".txt"
	}
	return out
}

func krakenPages(imagePaths []string, stop func() bool) ([]string, error) {
	if len(imagePaths) == 0 {
		return nil, nil
	}
	device := resolveKrakenDevice()
	texts, err := runKrakenPages(imagePaths, device, stop)
	if err != nil && strings.HasPrefix(device, "cuda") && isKrakenDeviceError(err) {
		log.Printf("[Extractor] OCR engine=kraken on %s failed, retrying on cpu: %v", device, err)
		fallbackKrakenToCPU()
		return runKrakenPages(imagePaths, "cpu", stop)
	}
	return texts, err
}

func runKrakenPages(imagePaths []string, device string, stop func() bool) ([]string, error) {
	if _, err := exec.LookPath("kraken"); err != nil {
		return nil, errKrakenUnavailable
	}
	model := krakenModelPath()
	if model == "" {
		return nil, errKrakenUnavailable
	}

	outPaths := krakenOutputPaths(imagePaths)
	defer removeFiles(outPaths)
	args := krakenCLIArgs(device, imagePaths, model)

	if strings.HasPrefix(device, "cuda") {
		if err := lockKrakenGPU(stop); err != nil {
			return nil, err
		}
		defer krakenGPUMu.Unlock()
	}
	if err := runCaptureDiscard(stop, "kraken", args...); err != nil {
		return nil, err
	}

	texts := make([]string, len(outPaths))
	for i, outPath := range outPaths {
		body, err := os.ReadFile(outPath)
		if err != nil {
			return nil, fmt.Errorf("kraken output %q: %w", outPath, err)
		}
		texts[i] = strings.TrimSpace(string(body))
	}
	return texts, nil
}

func lockKrakenGPU(stop func() bool) error {
	for {
		if err := checkPaused(stop); err != nil {
			return err
		}
		if krakenGPUMu.TryLock() {
			return nil
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func isKrakenDeviceError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "cuda") ||
		strings.Contains(msg, "out of memory") ||
		strings.Contains(msg, "cudnn") ||
		strings.Contains(msg, "cublas") ||
		strings.Contains(msg, "gpu")
}
