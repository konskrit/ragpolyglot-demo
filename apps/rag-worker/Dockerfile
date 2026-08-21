FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/rag-worker .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates poppler-utils \
    && addgroup -S app && adduser -S -G app app \
    && mkdir -p /uploads && chown -R app:app /uploads

WORKDIR /app
COPY --from=builder /out/rag-worker /app/rag-worker

USER app

EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8081/health >/dev/null || exit 1

ENTRYPOINT ["/app/rag-worker"]
