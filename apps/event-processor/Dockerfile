FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/event-processor .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates \
    && addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=builder /out/event-processor /app/event-processor

USER app

EXPOSE 8082

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8082/health >/dev/null || exit 1

ENTRYPOINT ["/app/event-processor"]
