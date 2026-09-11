using DocumentService.Data;
using DocumentService.Services;

namespace DocumentService.Endpoints;

public static class DocumentMaintenanceEndpoints
{
    public static void MapDocumentMaintenanceEndpoints(this WebApplication app)
    {
        app.MapPost("/api/documents/maintenance/fail-stale", FailStaleProcessing);
        app.MapPost("/api/documents/maintenance/auto-retry", AutoRetryFailed);
    }

    private static async Task<IResult> FailStaleProcessing(
        DocumentRepository repo,
        int minutes = 60,
        CancellationToken cancellationToken = default)
    {
        if (minutes < 1)
        {
            return Results.BadRequest(new { error = "minutes must be >= 1" });
        }

        var failed = await repo.FailStaleProcessingAsync(minutes, cancellationToken);
        return Results.Ok(new { failed });
    }

    private static async Task<IResult> AutoRetryFailed(
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        IConfiguration config,
        int? maxRetries,
        int? minAgeMinutes,
        int? limit,
        CancellationToken cancellationToken)
    {
        var retries = maxRetries ?? MaintenanceSettings.AutoRetryMaxRetries(config);
        var age = minAgeMinutes ?? MaintenanceSettings.AutoRetryMinAgeMinutes(config);
        var batch = limit ?? MaintenanceSettings.AutoRetryLimit(config);

        if (retries < 1 || age < 0 || batch < 1)
        {
            return Results.BadRequest(new { error = "Invalid auto-retry parameters." });
        }

        var candidates = await repo.ListAutoRetryCandidatesAsync(
            retries,
            age,
            batch,
            cancellationToken);

        var logger = loggerFactory.CreateLogger("DocumentMaintenance");
        var retried = 0;

        foreach (var id in candidates)
        {
            var doc = await repo.ClaimRetryAsync(id, ocrLang: null, updateOcrLang: false, cancellationToken);
            if (doc is null)
            {
                continue;
            }

            if (!await DocumentUploadPublisher.TryPublishOrMarkFailedAsync(
                    doc, repo, messageBroker, logger, cancellationToken, retry: true))
            {
                continue;
            }

            await repo.CompleteRetryAsync(doc.Id, cancellationToken);
            retried++;
        }

        return Results.Ok(new { retried });
    }
}
