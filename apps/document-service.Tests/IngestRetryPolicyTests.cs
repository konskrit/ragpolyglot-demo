using DocumentService.Services;
using Xunit;

namespace DocumentService.Tests;

public class IngestRetryPolicyTests
{
    [Theory]
    [InlineData("embedding_error")]
    [InlineData("storage_error")]
    [InlineData("chunking_error")]
    [InlineData("ocr_language_needed")]
    [InlineData("stale_timeout")]
    [InlineData(null)]
    public void ShouldResetIngest_always_false(string? reason)
    {
        Assert.False(IngestRetryPolicy.ShouldResetIngest(reason));
    }
}
