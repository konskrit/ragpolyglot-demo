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

        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);

        var migration = SqlScripts.Load("migrations/001_document_retry_columns.sql");
        await using var migrationCmd = new NpgsqlCommand(migration, connection);
        await migrationCmd.ExecuteNonQueryAsync(cancellationToken);

        var progressMigration = SqlScripts.Load("migrations/002_document_progress_columns.sql");
        await using var progressMigrationCmd = new NpgsqlCommand(progressMigration, connection);
        await progressMigrationCmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static int GetEmbeddingDimension()
    {
        var dim = Environment.GetEnvironmentVariable("EMBEDDING_DIMENSION");
        return int.TryParse(dim, out var result) && result > 0 ? result : 1536;
    }
}
