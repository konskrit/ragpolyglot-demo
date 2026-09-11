using System.Diagnostics.CodeAnalysis;

namespace DocumentService.Services;

public static class DocumentTitles
{
    public const string RequiredMessage = "Title is required.";
    public const string DuplicateMessage = "A document with this title already exists.";

    public static bool TryNormalize(string? title, [NotNullWhen(true)] out string normalized)
    {
        var value = title?.Trim();
        if (string.IsNullOrEmpty(value))
        {
            normalized = "";
            return false;
        }

        normalized = value;
        return true;
    }
}
