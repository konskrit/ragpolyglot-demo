namespace DocumentService.Services;

public static class IngestRetryPolicy
{
    // Worker always resumes from checkpoint/chunks; only document.deleted wipes ingest data.
    public static bool ShouldResetIngest(string? errorReason) => false;
}
