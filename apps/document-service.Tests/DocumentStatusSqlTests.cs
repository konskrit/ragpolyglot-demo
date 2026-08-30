using DocumentService.Sql;
using Xunit;

namespace DocumentService.Tests;

public class DocumentStatusSqlTests
{
    [Fact]
    public void Mark_ready_only_from_processing()
    {
        var sql = SqlScripts.Load("documents/mark_ready.sql");
        Assert.Contains("status = 'processing'", sql);
    }

    [Fact]
    public void Mark_failed_only_from_inflight_statuses()
    {
        var sql = SqlScripts.Load("documents/mark_failed.sql");
        Assert.Contains("status IN ('uploading', 'processing', 'failed')", sql);
    }

    [Fact]
    public void Mark_processing_only_from_uploading()
    {
        var sql = SqlScripts.Load("documents/mark_processing.sql");
        Assert.Contains("status = 'uploading'", sql);
    }
}
