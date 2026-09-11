using System.Text.Json;
using DocumentService.Contracts;
using DocumentService.Sql;
using Npgsql;
using NpgsqlTypes;

namespace DocumentService.Data;

public sealed class DocumentRepository(NpgsqlConnection db)
{
    private async Task EnsureOpenAsync(CancellationToken cancellationToken = default)
    {
        if (db.State != System.Data.ConnectionState.Open)
        {
            await db.OpenAsync(cancellationToken);
        }
    }

    public Task<IReadOnlyList<Document>> ListAsync(CancellationToken cancellationToken = default) =>
        QueryDocumentsAsync("documents/list.sql", cancellationToken);

    public Task<IReadOnlyList<Document>> ListProcessingAsync(CancellationToken cancellationToken = default) =>
        QueryDocumentsAsync("documents/list_processing.sql", cancellationToken);

    public Task<Document?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/get_by_id.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public async Task<IReadOnlyList<DocumentChunk>> ListChunksAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        await using var cmd = await CommandAsync("chunks/list_by_document.sql", cancellationToken);
        cmd.Parameters.AddWithValue("id", documentId);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var chunks = new List<DocumentChunk>();

        while (await reader.ReadAsync(cancellationToken))
        {
            chunks.Add(new DocumentChunk
            {
                Id = reader.GetInt64(0),
                DocumentId = reader.GetGuid(1),
                ChunkIndex = reader.GetInt32(2),
                Content = reader.GetString(3),
                CreatedAt = reader.GetDateTime(4)
            });
        }

        return chunks;
    }

    public async Task<string?> GetSummaryAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        await using var cmd = await CommandAsync("chunks/get_summary.sql", cancellationToken);
        cmd.Parameters.AddWithValue("id", documentId);
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        if (result is not string content) return null;

        const string prefix = "[Document summary]\n";
        var trimmed = content.Trim();
        if (trimmed.StartsWith(prefix, StringComparison.Ordinal))
        {
            trimmed = trimmed[prefix.Length..].Trim();
        }
        return trimmed.Length == 0 ? null : trimmed;
    }

    public Task<Document?> CreateAsync(string title, string filePath, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/create.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("title", title);
            cmd.Parameters.AddWithValue("filePath", filePath);
            cmd.Parameters.AddWithValue("status", "uploading");
            cmd.Parameters.AddWithValue("uploadedBy", NpgsqlDbType.Uuid, DBNull.Value);
        });

    public Task<Document?> RenameAsync(Guid id, string title, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/rename.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("title", title);
        });

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/delete.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id)) > 0;

    public async Task<bool> MarkProcessingAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/mark_processing.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id)) > 0;

    public async Task<bool> MarkReadyAsync(Guid id, string? ocrLang = null, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/mark_ready.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("ocrLang", (object?)ocrLang ?? DBNull.Value);
        }) > 0;

    public async Task<bool> MarkFailedAsync(Guid id, string? errorReason = null, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/mark_failed.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("errorReason", (object?)errorReason ?? DBNull.Value);
        }) > 0;

    public async Task<bool> MarkPausedAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/mark_paused.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id)) > 0;

    public Task<Document?> ClaimResumeAsync(Guid id, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/claim_resume.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public async Task UpdateProgressAsync(
        Guid id,
        string stage,
        int done,
        int total,
        CancellationToken cancellationToken = default)
    {
        await ExecuteAsync("documents/update_progress.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("stage", stage);
            cmd.Parameters.AddWithValue("done", done);
            cmd.Parameters.AddWithValue("total", total);
        });
    }

    public Task<int> FailStaleProcessingAsync(
        int minutes,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync("documents/fail_stale.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("minutes", minutes));

    public Task<IReadOnlyList<Guid>> ListAutoRetryCandidatesAsync(
        int maxRetries,
        int minAgeMinutes,
        int limit,
        CancellationToken cancellationToken = default) =>
        ListIdsAsync("documents/list_auto_retry.sql", maxRetries, minAgeMinutes, limit, cancellationToken);

    public Task<IReadOnlyList<Guid>> ListAutoRetrySummarizeCandidatesAsync(
        int maxRetries,
        int minAgeMinutes,
        int limit,
        CancellationToken cancellationToken = default) =>
        ListIdsAsync("documents/list_auto_retry_summarize.sql", maxRetries, minAgeMinutes, limit, cancellationToken);

    private async Task<IReadOnlyList<Guid>> ListIdsAsync(
        string sql,
        int maxRetries,
        int minAgeMinutes,
        int limit,
        CancellationToken cancellationToken)
    {
        await using var cmd = await CommandAsync(sql, cancellationToken);
        cmd.Parameters.AddWithValue("maxRetries", maxRetries);
        cmd.Parameters.AddWithValue("minAgeMinutes", minAgeMinutes);
        cmd.Parameters.AddWithValue("limit", limit);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        var ids = new List<Guid>();
        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetGuid(0));
        }
        return ids;
    }

    public Task<Document?> ClaimOcrLangAsync(
        Guid id,
        string? ocrLang,
        CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/claim_ocr_lang.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("ocrLang", (object?)ocrLang ?? DBNull.Value);
        });

    public Task<Document?> ClaimRetryAsync(
        Guid id,
        string? ocrLang,
        bool updateOcrLang,
        CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/claim_retry.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("updateOcrLang", updateOcrLang);
            cmd.Parameters.AddWithValue("ocrLang", (object?)ocrLang ?? DBNull.Value);
        });

    public Task<Document?> CompleteRetryAsync(Guid id, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/complete_retry.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public async Task CompleteSummarizeRetryAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/complete_summarize_retry.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public Task<Document?> ClaimSummarizeAsync(Guid id, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/claim_summarize.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public Task<Document?> ClaimSummarizeResumeAsync(Guid id, CancellationToken cancellationToken = default) =>
        QueryDocumentAsync("documents/claim_summarize_resume.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public async Task<bool> MarkSummarizePausedAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/mark_summarize_paused.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id)) > 0;

    public async Task ClearSummarizeAsync(Guid id, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/clear_summarize.sql", cancellationToken, cmd => cmd.Parameters.AddWithValue("id", id));

    public async Task MarkSummarizeFailedAsync(Guid id, string errorReason, CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/mark_summarize_failed.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("errorReason", errorReason);
        });

    public async Task UpdateSummarizeProgressAsync(
        Guid id,
        int done,
        int total,
        CancellationToken cancellationToken = default) =>
        await ExecuteAsync("documents/update_summarize_progress.sql", cancellationToken, cmd =>
        {
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("done", done);
            cmd.Parameters.AddWithValue("total", total);
        });

    public async Task PingAsync(CancellationToken cancellationToken = default)
    {
        await using var cmd = await CommandAsync("health/ping.sql", cancellationToken);
        await cmd.ExecuteScalarAsync(cancellationToken);
    }

    public async Task LogSystemAsync(
        string eventType,
        object? metadata = null,
        Guid? documentId = null,
        CancellationToken cancellationToken = default)
    {
        await using var cmd = await CommandAsync("system_logs/insert.sql", cancellationToken);
        cmd.Parameters.AddWithValue("eventType", eventType);
        cmd.Parameters.AddWithValue("documentId", NpgsqlDbType.Uuid, documentId is null ? DBNull.Value : documentId.Value);
        var metaParam = cmd.Parameters.Add("metadata", NpgsqlDbType.Jsonb);
        metaParam.Value = metadata is null ? DBNull.Value : JsonSerializer.Serialize(metadata);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task<NpgsqlCommand> CommandAsync(string sql, CancellationToken cancellationToken)
    {
        await EnsureOpenAsync(cancellationToken);
        return new NpgsqlCommand(SqlScripts.Load(sql), db);
    }

    private async Task<Document?> QueryDocumentAsync(
        string sql,
        CancellationToken cancellationToken,
        Action<NpgsqlCommand> bind)
    {
        await using var cmd = await CommandAsync(sql, cancellationToken);
        bind(cmd);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadDocument(reader);
    }

    private async Task<IReadOnlyList<Document>> QueryDocumentsAsync(string sql, CancellationToken cancellationToken)
    {
        await using var cmd = await CommandAsync(sql, cancellationToken);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

        var docs = new List<Document>();
        while (await reader.ReadAsync(cancellationToken))
        {
            docs.Add(ReadDocument(reader));
        }

        return docs;
    }

    private async Task<int> ExecuteAsync(
        string sql,
        CancellationToken cancellationToken,
        Action<NpgsqlCommand> bind)
    {
        await using var cmd = await CommandAsync(sql, cancellationToken);
        bind(cmd);
        return await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static Document ReadDocument(NpgsqlDataReader reader) => new()
    {
        Id = reader.GetGuid(0),
        Title = reader.GetString(1),
        FilePath = reader.GetString(2),
        Status = Enum.Parse<DocumentStatus>(reader.GetString(3), ignoreCase: true),
        UploadedBy = reader.IsDBNull(4) ? null : reader.GetGuid(4),
        ErrorReason = reader.IsDBNull(5) ? null : reader.GetString(5),
        RetryCount = reader.GetInt32(6),
        ProgressStage = reader.IsDBNull(7) ? null : reader.GetString(7),
        ProgressDone = reader.IsDBNull(8) ? null : reader.GetInt32(8),
        ProgressTotal = reader.IsDBNull(9) ? null : reader.GetInt32(9),
        OcrLang = reader.IsDBNull(10) ? null : reader.GetString(10),
        SummarizeStatus = reader.IsDBNull(11) ? null : reader.GetString(11),
        SummarizeDone = reader.IsDBNull(12) ? null : reader.GetInt32(12),
        SummarizeTotal = reader.IsDBNull(13) ? null : reader.GetInt32(13),
        SummarizeError = reader.IsDBNull(14) ? null : reader.GetString(14),
        CreatedAt = reader.GetDateTime(15),
        UpdatedAt = reader.GetDateTime(16)
    };
}
