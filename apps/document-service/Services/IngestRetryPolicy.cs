namespace DocumentService.Services;

public static class IngestRetryPolicy
{
    // Worker resumes from checkpoint/chunks unless ResetIngest is set on document.uploaded
    // (OCR language change). Only document.deleted otherwise wipes ingest data.
    public static bool OcrLangChanged(string? before, string? after) =>
        !string.Equals(NormalizeOcrLang(before), NormalizeOcrLang(after), StringComparison.Ordinal);

    public static string NormalizeOcrLang(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();

    public static bool TryNormalizeOcrLang(string? ocrLang, out string? normalized)
    {
        normalized = null;
        if (string.IsNullOrWhiteSpace(ocrLang))
        {
            return true;
        }

        var value = ocrLang.Trim();
        if (value is "ancient_greek" or "modern_greek" or "english")
        {
            normalized = value;
            return true;
        }

        if (!IsOcrLangCode(value))
        {
            return false;
        }

        normalized = value;
        return true;
    }

    private static bool IsOcrLangCode(ReadOnlySpan<char> value)
    {
        if (value.Length is < 2 or > 32 || value[0] is < 'a' or > 'z')
        {
            return false;
        }

        for (var i = 1; i < value.Length; i++)
        {
            if (value[i] is not ((>= 'a' and <= 'z') or (>= '0' and <= '9') or '_' or '+'))
            {
                return false;
            }
        }

        return true;
    }
}
