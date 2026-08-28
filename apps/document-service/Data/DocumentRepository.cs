using System.Text.Json;
using DocumentService.Contracts;
using DocumentService.Sql;
using Npgsql;
using NpgsqlTypes;

namespace DocumentService.Data;

public sealed class DocumentRepository(NpgsqlConnection db)
{
    public async Task EnsureOpenAsync(CancellationToken cancellationToken = default)
    {
        if (db.State != System.Data.ConnectionState.Open)
        {
            await db.OpenAsync(cancellationToken);
        }
    }

    public async Task<IReadOnlyList<Document>> ListAsync(CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/list.sql"), db);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

        var docs = new List<Document>();
        while (await reader.ReadAsync(cancellationToken))
        {
            docs.Add(ReadDocument(reader));
        }

        return docs;
    }

    public async Task<Document?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/get_by_id.sql"), db);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadDocument(reader);
    }

    public async Task<IReadOnlyList<DocumentChunk>> ListChunksAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("chunks/list_by_document.sql"), db);
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

    public async Task<Document> CreateAsync(string title, string filePath, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/create.sql"), db);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("filePath", filePath);
        cmd.Parameters.AddWithValue("status", "uploading");
        cmd.Parameters.AddWithValue("uploadedBy", NpgsqlDbType.Uuid, DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("Failed to create document.");
        }

        return ReadDocument(reader);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/delete.sql"), db);
        cmd.Parameters.AddWithValue("id", id);
        var rows = await cmd.ExecuteNonQueryAsync(cancellationToken);
        return rows > 0;
    }

    public async Task<bool> MarkProcessingAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/mark_processing.sql"), db);
        cmd.Parameters.AddWithValue("id", id);
        var rows = await cmd.ExecuteNonQueryAsync(cancellationToken);
        return rows > 0;
    }

    public async Task<bool> MarkReadyAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/mark_ready.sql"), db);
        cmd.Parameters.AddWithValue("id", id);
        var rows = await cmd.ExecuteNonQueryAsync(cancellationToken);
        return rows > 0;
    }

    public async Task<bool> MarkFailedAsync(Guid id, string? errorReason = null, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/mark_failed.sql"), db);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("errorReason", (object?)errorReason ?? DBNull.Value);
        var rows = await cmd.ExecuteNonQueryAsync(cancellationToken);
        return rows > 0;
    }

    public async Task<Document?> ClaimRetryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/claim_retry.sql"), db);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadDocument(reader);
    }

    public async Task<Document?> CompleteRetryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("documents/complete_retry.sql"), db);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadDocument(reader);
    }

    public async Task PingAsync(CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(SqlScripts.Load("health/ping.sql"), db);
        await cmd.ExecuteScalarAsync(cancellationToken);
    }

    public async Task LogSystemAsync(
        string eventType,
        object? metadata = null,
        Guid? documentId = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureOpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(SqlScripts.Load("system_logs/insert.sql"), db);
        cmd.Parameters.AddWithValue("eventType", eventType);
        cmd.Parameters.AddWithValue("documentId", NpgsqlDbType.Uuid, documentId is null ? DBNull.Value : documentId.Value);
        var metaParam = cmd.Parameters.Add("metadata", NpgsqlDbType.Jsonb);
        metaParam.Value = metadata is null ? DBNull.Value : JsonSerializer.Serialize(metadata);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
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
        CreatedAt = reader.GetDateTime(7),
        UpdatedAt = reader.GetDateTime(8)
    };
}
