namespace DocumentService.Services;

public static class IngestRetryPolicy
{
    // Worker resumes from checkpoint/chunks unless ResetIngest is set on document.uploaded
    // (OCR language change). Only document.deleted otherwise wipes ingest data.
    public static bool ShouldResetIngest(string? errorReason) => false;

    public static bool OcrLangChanged(string? before, string? after) =>
        !string.Equals(NormalizeOcrLang(before), NormalizeOcrLang(after), StringComparison.Ordinal);

    public static string NormalizeOcrLang(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
}
