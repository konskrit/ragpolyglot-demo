using DocumentService.Services;
using Xunit;

namespace DocumentService.Tests;

public class IngestRetryPolicyTests
{
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
