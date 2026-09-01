FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/event-processor .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget \
    && addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=builder /out/event-processor /app/event-processor

USER app

EXPOSE 8082

ENTRYPOINT ["/app/event-processor"]
