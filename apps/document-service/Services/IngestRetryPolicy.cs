namespace DocumentService.Services;

public static class IngestRetryPolicy
{
    public static bool ShouldResetIngest(string? errorReason) =>
        errorReason is not "embedding_error" and not "storage_error";
}
