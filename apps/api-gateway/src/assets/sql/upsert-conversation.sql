INSERT INTO conversations (id, title)
VALUES ($1, $2)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
