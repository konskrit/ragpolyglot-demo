using DocumentService.Services;
using Xunit;

namespace DocumentService.Tests;

public class DocumentProgressStagesTests
{
    [Theory]
    [InlineData("extracting", true)]
    [InlineData("embedding", true)]
    [InlineData("", false)]
    [InlineData("chunking", false)]
    [InlineData(null, false)]
    public void IsValid(string? stage, bool expected)
    {
        Assert.Equal(expected, DocumentProgressStages.IsValid(stage));
    }
}
