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
    && mkdir -p /uploads && chown app:app /uploads

WORKDIR /app
COPY --from=builder /out/rag-worker /app/rag-worker

USER app

EXPOSE 8081

ENTRYPOINT ["/app/rag-worker"]
