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

    [Theory]
    [InlineData(null, null, false)]
    [InlineData("", null, false)]
    [InlineData("grc", "grc", false)]
    [InlineData("grc", "ell", true)]
    [InlineData(null, "grc", true)]
    [InlineData("grc", null, true)]
    [InlineData("  eng  ", "eng", false)]
    public void OcrLangChanged_compares_normalized(string? before, string? after, bool changed)
    {
        Assert.Equal(changed, IngestRetryPolicy.OcrLangChanged(before, after));
    }
}
