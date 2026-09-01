SELECT document_id::text, stage, ocr_page_done, ocr_total, ocr_langs, ocr_lang_hint,
       partial_text, embed_done, file_path, paused
FROM document_ingest_checkpoints
WHERE document_id = $1
