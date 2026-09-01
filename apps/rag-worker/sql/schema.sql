CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    service TEXT NOT NULL,
    event_type TEXT NOT NULL,
    document_id UUID,
    metadata JSONB,
    duration_ms DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_logs (
    id BIGSERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    top_k INT NOT NULL,
    result_count INT NOT NULL,
    duration_ms DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_ingest_checkpoints (
    document_id UUID PRIMARY KEY,
    stage TEXT NOT NULL,
    ocr_page_done INT NOT NULL DEFAULT 0,
    ocr_total INT NOT NULL DEFAULT 0,
    ocr_langs TEXT NOT NULL DEFAULT '',
    ocr_lang_hint TEXT NOT NULL DEFAULT '',
    partial_text TEXT NOT NULL DEFAULT '',
    embed_done INT NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL DEFAULT '',
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE document_ingest_checkpoints
    ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;
