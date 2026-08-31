using DocumentService.Sql;
using Xunit;

namespace DocumentService.Tests;

public class DocumentStatusSqlTests
{
    [Fact]
    public void Mark_ready_matches_by_id()
    {
        var sql = SqlScripts.Load("documents/mark_ready.sql");
        Assert.Contains("SET status = 'ready'", sql);
        Assert.Contains("WHERE id = @id", sql);
    }

    [Fact]
    public void Mark_failed_matches_by_id()
    {
        var sql = SqlScripts.Load("documents/mark_failed.sql");
        Assert.Contains("SET status = 'failed'", sql);
        Assert.Contains("WHERE id = @id", sql);
    }
}
