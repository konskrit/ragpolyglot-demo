INSERT INTO documents (title, file_path, status, uploaded_by)
VALUES (@title, @filePath, @status, @uploadedBy)
RETURNING id, title, file_path, status, uploaded_by, created_at, updated_at;
