using System.Text.Json;

namespace DocumentService.Services;

public static class MessageClassification
{
    public static bool IsPoison(Exception ex) =>
        ex is JsonException
        || (ex is ArgumentException and not ArgumentNullException);
}
