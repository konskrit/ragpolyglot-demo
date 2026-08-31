FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/rag-worker .

FROM alpine:3.21 AS tessdata
ARG INSTALL_OCR_LANGS=1
RUN apk add --no-cache wget \
    && mkdir -p /out \
    && if [ "$INSTALL_OCR_LANGS" = "1" ]; then \
         for lang in eng ell grc deu fra ita lat rus srp bul; do \
           wget --tries=5 --timeout=60 -O "/out/${lang}.traineddata" \
             "https://github.com/tesseract-ocr/tessdata_fast/raw/4.1.0/${lang}.traineddata"; \
         done; \
       fi

FROM alpine:3.21

RUN apk add --no-cache ca-certificates poppler-utils \
        tesseract-ocr tesseract-ocr-data-osd \
    && addgroup -S app && adduser -S -G app app \
    && mkdir -p /uploads /usr/share/tessdata \
    && chown app:app /uploads

COPY --from=tessdata /out/ /usr/share/tessdata/

WORKDIR /app
COPY --from=builder /out/rag-worker /app/rag-worker

USER app

EXPOSE 8081

ENTRYPOINT ["/app/rag-worker"]
