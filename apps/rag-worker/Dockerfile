FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/rag-worker .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates poppler-utils wget \
        tesseract-ocr tesseract-ocr-data-osd \
    && wget -q -O /tmp/tessdata.tar.gz \
         https://github.com/tesseract-ocr/tessdata/archive/refs/tags/4.1.0.tar.gz \
    && tar -xzf /tmp/tessdata.tar.gz -C /tmp \
    && mkdir -p /usr/share/tessdata \
    && cp /tmp/tessdata-4.1.0/*.traineddata /usr/share/tessdata/ \
    && rm -rf /tmp/tessdata.tar.gz /tmp/tessdata-4.1.0 \
    && addgroup -S app && adduser -S -G app app \
    && mkdir -p /uploads && chown app:app /uploads

WORKDIR /app
COPY --from=builder /out/rag-worker /app/rag-worker

USER app

EXPOSE 8081

ENTRYPOINT ["/app/rag-worker"]
