using DocumentService.Sql;
using Xunit;

namespace DocumentService.Tests;

public class SqlScriptsTests
{
    [Theory]
    [InlineData("schema.sql")]
    [InlineData("health/ping.sql")]
    [InlineData("documents/list.sql")]
    [InlineData("documents/get_by_id.sql")]
    [InlineData("documents/create.sql")]
    [InlineData("documents/delete.sql")]
    [InlineData("documents/mark_ready.sql")]
    [InlineData("documents/mark_failed.sql")]
    [InlineData("documents/mark_processing.sql")]
    [InlineData("documents/fail_stale.sql")]
    [InlineData("documents/claim_retry.sql")]
    [InlineData("documents/claim_ocr_lang.sql")]
    [InlineData("documents/complete_retry.sql")]
    [InlineData("migrations/001_document_retry_columns.sql")]
    [InlineData("chunks/list_by_document.sql")]
    public void Load_resolves_embedded_sql(string path)
    {
        var sql = SqlScripts.Load(path);
        Assert.False(string.IsNullOrWhiteSpace(sql));
    }

    [Fact]
    public void Load_throws_for_missing_script()
    {
        Assert.Throws<InvalidOperationException>(() => SqlScripts.Load("missing/nope.sql"));
    }
}
