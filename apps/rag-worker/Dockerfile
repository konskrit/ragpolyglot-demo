FROM golang:1.26-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o /out/rag-worker .

FROM alpine:3.21 AS tessdata
ARG INSTALL_OCR_LANGS=1
RUN apk add --no-cache wget && mkdir -p /out
RUN --mount=type=cache,target=/tesscache \
    if [ "$INSTALL_OCR_LANGS" = "1" ]; then \
      for lang in eng ell grc deu fra ita lat rus srp bul; do \
        if [ ! -s "/tesscache/${lang}.traineddata" ]; then \
          wget --tries=5 --timeout=60 -O "/tesscache/${lang}.traineddata" \
            "https://github.com/tesseract-ocr/tessdata_fast/raw/4.1.0/${lang}.traineddata"; \
        fi \
        && cp "/tesscache/${lang}.traineddata" "/out/${lang}.traineddata"; \
      done; \
    fi

FROM python:3.12-slim-bookworm AS kraken
ARG INSTALL_KRAKEN=1
ARG KRAKEN_TORCH=cu124
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /models
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/modelcache \
    if [ "$INSTALL_KRAKEN" = "1" ]; then \
      if [ "$KRAKEN_TORCH" = "cpu" ]; then \
        TORCH_INDEX="https://download.pytorch.org/whl/cpu"; \
      else \
        TORCH_INDEX="https://download.pytorch.org/whl/${KRAKEN_TORCH}"; \
      fi \
      && pip install --index-url "$TORCH_INDEX" torch torchvision \
      && pip install kraken \
      && pip install --force-reinstall --no-deps \
           --index-url "$TORCH_INDEX" torch torchvision \
      && python3 -c "import torch; import torchvision; from torchvision.transforms import v2; import kraken" \
      && if [ ! -s /modelcache/grc.mlmodel ]; then \
           curl -fsSL --retry 5 -o /modelcache/grc.mlmodel \
             "https://zenodo.org/api/records/21295925/files/cllg_recognition_v1.mlmodel/content"; \
         fi \
      && cp /modelcache/grc.mlmodel /models/grc.mlmodel; \
    fi

FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl poppler-utils libgomp1 \
        tesseract-ocr tesseract-ocr-osd \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /uploads /models \
    && chown app:app /uploads

COPY --from=kraken /usr/local /usr/local
COPY --from=kraken /models/ /models/
RUN chown -R app:app /models

COPY --from=tessdata /out/ /usr/share/tesseract-ocr/5/tessdata/

WORKDIR /app
COPY --from=builder /out/rag-worker /app/rag-worker

ENV KRAKEN_GRC_MODEL=/models/grc.mlmodel

USER app

EXPOSE 8081

ENTRYPOINT ["/app/rag-worker"]
