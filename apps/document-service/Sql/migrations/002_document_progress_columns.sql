ALTER TABLE documents ADD COLUMN IF NOT EXISTS progress_stage TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS progress_done INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS progress_total INT;
