INSERT INTO document_ingest_checkpoints (
    document_id, stage, ocr_page_done, ocr_total, ocr_langs, ocr_lang_hint,
    partial_text, embed_done, file_path, paused, updated_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
ON CONFLICT (document_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    ocr_page_done = EXCLUDED.ocr_page_done,
    ocr_total = EXCLUDED.ocr_total,
    ocr_langs = EXCLUDED.ocr_langs,
    ocr_lang_hint = EXCLUDED.ocr_lang_hint,
    partial_text = EXCLUDED.partial_text,
    embed_done = EXCLUDED.embed_done,
    file_path = EXCLUDED.file_path,
    paused = EXCLUDED.paused,
    updated_at = NOW()
