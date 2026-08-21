using System.Text.Json;
using DocumentService.Services;
using Xunit;

namespace DocumentService.Tests;

public class MessageClassificationTests
{
    [Theory]
    [InlineData(typeof(JsonException), true)]
    [InlineData(typeof(ArgumentException), true)]
    [InlineData(typeof(InvalidOperationException), false)]
    [InlineData(typeof(TimeoutException), false)]
    [InlineData(typeof(IOException), false)]
    public void IsPoison_classifies_exceptions(Type type, bool expected)
    {
        var ex = (Exception)Activator.CreateInstance(type, "boom")!;
        Assert.Equal(expected, MessageClassification.IsPoison(ex));
    }
}
