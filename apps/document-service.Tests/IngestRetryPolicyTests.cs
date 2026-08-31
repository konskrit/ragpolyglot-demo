using DocumentService.Services;
using Xunit;

namespace DocumentService.Tests;

public class IngestRetryPolicyTests
{
    [Theory]
    [InlineData("embedding_error", false)]
    [InlineData("storage_error", false)]
    [InlineData("chunking_error", true)]
    [InlineData("ocr_language_needed", true)]
    [InlineData("stale_timeout", false)]
    [InlineData(null, true)]
    public void ShouldResetIngest(string? reason, bool expected)
    {
        Assert.Equal(expected, IngestRetryPolicy.ShouldResetIngest(reason));
    }
}
