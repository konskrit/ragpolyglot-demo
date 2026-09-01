package extractor

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"unicode"

	"apps/rag-worker/workpool"
)

const (
	minNativeLetters = 100
	maxOsdPages      = 5
)

var (
	ErrOcrLanguageNeeded = errors.New("ocr_language_needed")
	ErrPaused            = errors.New("paused")
)

type OCRProgressFunc func(done, total int, textSoFar, langs string) error

type OCRState struct {
	StartPage    int
	PriorText    string
	Resolved     string
	ShouldPause  func() bool
	OnProgress   OCRProgressFunc
	OnRenderPage func(page, total int)
	Pool         *workpool.Pool
	PageWorkers  func(pageCount int) int
	OnOCRStart   func() func()
}

func hasEnoughText(s string) bool {
	n := 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			n++
			if n >= minNativeLetters {
				return true
			}
		}
	}
	return false
}

func extractPDFWithOCR(pdfPath, ocrLang string, state OCRState) (text string, resolved string, err error) {
	stop := state.ShouldPause
	total, err := pdfPageCount(pdfPath, stop)
	if err != nil {
		return "", "", err
	}

	start := state.StartPage
	if start < 1 {
		start = 1
	}
	if start > total+1 {
		return "", "", fmt.Errorf("ocr start page %d past end %d", start, total)
	}

	prior := strings.TrimSpace(state.PriorText)

	langs := resolvedOCRLangs(ocrLang, state.Resolved)
	if langs == "" && start > 1 {
		return prior, "", fmt.Errorf("ocr resume missing resolved language")
	}

	dir, err := os.MkdirTemp("", "ocr-*")
	if err != nil {
		return "", "", fmt.Errorf("ocr temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	if langs == "" {
		limit := maxOsdPages
		if total < limit {
			limit = total
		}
		err := state.Pool.RunWhile(workpool.OCRPageMemory(), stop, func() error {
			osdPaths := make([]string, 0, limit)
			for page := 1; page <= limit; page++ {
				img, err := renderPDFPage(pdfPath, page, filepath.Join(dir, fmt.Sprintf("osd-%d", page)), stop)
				if err != nil {
					if errors.Is(err, ErrPaused) {
						return err
					}
					continue
				}
				osdPaths = append(osdPaths, img)
			}
			if len(osdPaths) == 0 {
				return ErrOcrLanguageNeeded
			}
			var err error
			langs, err = resolveLangsFromPages(ocrLang, osdPaths, stop)
			return err
		})
		if err != nil {
			if errors.Is(err, ErrPaused) || errors.Is(err, workpool.ErrStopped) {
				return prior, langs, ErrPaused
			}
			return "", "", err
		}
	}

	action := "starting"
	if start > 1 {
		action = "resuming"
	}
	log.Printf("[Extractor] OCR engine=%s %s page=%d/%d langs=%s", ocrEngine(langs), action, start, total, langs)
	if usesKraken(langs) {
		return ocrPagesKraken(pdfPath, dir, start, total, langs, prior, ocrLang, stop, state)
	}
	return ocrPagesParallel(pdfPath, dir, start, total, langs, prior, ocrLang, stop, state)
}

func ocrPagesParallel(pdfPath, dir string, start, total int, langs, prior, ocrLang string, stop func() bool, state OCRState) (string, string, error) {
	pageText := make([]string, total+1)
	pageDone := make([]bool, total+1)
	var (
		mu       sync.Mutex
		wg       sync.WaitGroup
		firstErr error
		aborted  atomic.Bool
		lastDone = start - 1
		mem      = workpool.OCRPageMemory()
	)

	recordErr := func(err error) {
		if err == nil {
			return
		}
		mu.Lock()
		if firstErr == nil {
			firstErr = err
		}
		mu.Unlock()
		aborted.Store(true)
	}

	processPage := func(page int) error {
		if stop != nil && stop() {
			return ErrPaused
		}
		err := state.Pool.RunWhile(mem, stop, func() error {
			if stop != nil && stop() {
				return ErrPaused
			}
			text, err := ocrOnePage(pdfPath, dir, page, langs, stop)
			if err != nil {
				return err
			}

			mu.Lock()
			defer mu.Unlock()
			pageText[page] = text
			pageDone[page] = true

			for p := lastDone + 1; p <= total; p++ {
				if !pageDone[p] {
					break
				}
				lastDone = p
			}
			done := lastDone
			if done < start {
				return nil
			}
			soFar := joinPageText(prior, pageText, start, done)
			log.Printf("[Extractor] OCR engine=tesseract progress %d/%d", done, total)
			if state.OnProgress != nil {
				if err := state.OnProgress(done, total, soFar, langs); err != nil {
					return err
				}
			}
			return nil
		})
		if errors.Is(err, workpool.ErrStopped) {
			return ErrPaused
		}
		return err
	}

	pages := total - start + 1
	workers := state.Pool.Slots()
	if state.PageWorkers != nil {
		workers = state.PageWorkers(total)
	}
	if workers < 1 {
		workers = 1
	}
	if workers > pages {
		workers = pages
	}
	log.Printf("[Extractor] OCR engine=tesseract workers=%d slots=%d pages=%d", workers, state.Pool.Slots(), pages)

	pageCh := make(chan int, pages)
	for page := start; page <= total; page++ {
		pageCh <- page
	}
	close(pageCh)

	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for page := range pageCh {
				if aborted.Load() {
					return
				}
				if err := processPage(page); err != nil {
					recordErr(err)
					return
				}
			}
		}()
	}
	wg.Wait()

	if firstErr != nil {
		if errors.Is(firstErr, ErrPaused) {
			mu.Lock()
			soFar := joinPageText(prior, pageText, start, lastDone)
			mu.Unlock()
			return soFar, langs, ErrPaused
		}
		return "", langs, firstErr
	}

	return finishOCRText(joinPageText(prior, pageText, start, total), langs, state.Resolved, ocrLang)
}

func ocrOnePage(pdfPath, dir string, page int, langs string, stop func() bool) (string, error) {
	log.Printf("[Extractor] OCR engine=tesseract page %d langs=%s", page, langs)
	img, err := renderPDFPage(pdfPath, page, filepath.Join(dir, fmt.Sprintf("page-%d", page)), stop)
	if err != nil {
		return "", err
	}
	defer os.Remove(img)
	return tesseractPage(img, langs, stop)
}

func joinPageText(prior string, pages []string, start, end int) string {
	var b strings.Builder
	if prior != "" {
		b.WriteString(prior)
	}
	for page := start; page <= end; page++ {
		text := strings.TrimSpace(pages[page])
		if text == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(text)
	}
	return b.String()
}

func finishOCRText(raw, langs, resolved, ocrLang string) (string, string, error) {
	text := trimToLimit(strings.TrimSpace(raw))
	if text == "" {
		if tesseractLangs(ocrLang) == "" && langs == "" && resolved == "" {
			return "", langs, ErrOcrLanguageNeeded
		}
		return "", langs, fmt.Errorf("no text extracted")
	}
	return text, langs, nil
}

func removeFiles(paths []string) {
	for _, p := range paths {
		os.Remove(p)
	}
}
