SELECT id, title, file_path, status, uploaded_by, created_at, updated_at
FROM documents
WHERE id = @id;
