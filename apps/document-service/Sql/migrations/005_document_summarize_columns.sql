ALTER TABLE documents ADD COLUMN IF NOT EXISTS summarize_status TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summarize_done INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summarize_total INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summarize_error TEXT;
