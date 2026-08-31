using DocumentService.Sql;
using Npgsql;

namespace DocumentService.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeDatabaseAsync(NpgsqlConnection connection, CancellationToken cancellationToken = default)
    {
        var dimension = GetEmbeddingDimension();
        var sql = SqlScripts.Load("schema.sql")
            .Replace("__EMBEDDING_DIMENSION__", dimension.ToString(), StringComparison.Ordinal);

        await using (var command = new NpgsqlCommand(sql, connection))
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        foreach (var path in new[]
        {
            "migrations/001_document_retry_columns.sql",
            "migrations/002_document_progress_columns.sql",
            "migrations/003_document_ocr_lang.sql",
            "migrations/004_document_paused_status.sql",
        })
        {
            await using var cmd = new NpgsqlCommand(SqlScripts.Load(path), connection);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static int GetEmbeddingDimension()
    {
        var dim = Environment.GetEnvironmentVariable("EMBEDDING_DIMENSION");
        return int.TryParse(dim, out var result) && result > 0 ? result : 1536;
    }
}
