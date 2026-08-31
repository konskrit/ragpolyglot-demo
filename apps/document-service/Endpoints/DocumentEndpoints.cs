using DocumentService.Contracts;
using DocumentService.Data;
using DocumentService.Services;

namespace DocumentService.Endpoints;

public static class DocumentEndpoints
{
    private const string OcrLanguageNeeded = "ocr_language_needed";

    public static void MapDocumentEndpoints(this WebApplication app)
    {
        app.MapGet("/api/documents", ListDocuments);
        app.MapGet("/api/documents/{id:guid}", GetDocumentById);
        app.MapGet("/api/documents/{id:guid}/chunks", GetDocumentChunks);
        app.MapPost("/api/documents", CreateDocument);
        app.MapPost("/api/documents/{id:guid}/retry", RetryDocument);
        app.MapPost("/api/documents/{id:guid}/ocr-lang", SetOcrLang);
        app.MapPost("/api/documents/{id:guid}/pause", PauseDocument);
        app.MapPost("/api/documents/{id:guid}/resume", ResumeDocument);
        app.MapPost("/api/documents/maintenance/fail-stale", FailStaleProcessing);
        app.MapPost("/api/documents/maintenance/auto-retry", AutoRetryFailed);
        app.MapDelete("/api/documents/{id:guid}", DeleteDocument);
    }

    private static async Task<IResult> ListDocuments(DocumentRepository repo, CancellationToken cancellationToken)
    {
        var docs = await repo.ListAsync(cancellationToken);
        return Results.Ok(docs);
    }

    private static async Task<IResult> GetDocumentById(Guid id, DocumentRepository repo, CancellationToken cancellationToken)
    {
        var doc = await repo.GetByIdAsync(id, cancellationToken);
        return doc is null ? Results.NotFound() : Results.Ok(doc);
    }

    private static async Task<IResult> GetDocumentChunks(Guid id, DocumentRepository repo, CancellationToken cancellationToken)
    {
        var chunks = await repo.ListChunksAsync(id, cancellationToken);
        return Results.Ok(chunks);
    }

    private static async Task<IResult> CreateDocument(
        DocumentCreateDto dto,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dto.Title) || string.IsNullOrWhiteSpace(dto.FilePath))
        {
            return Results.BadRequest(new { error = "Title and FilePath are required." });
        }

        var doc = await repo.CreateAsync(dto.Title.Trim(), dto.FilePath.Trim(), cancellationToken);
        var logger = loggerFactory.CreateLogger("DocumentEndpoints");

        if (!await repo.MarkProcessingAsync(doc.Id, cancellationToken))
        {
            return Results.Problem(
                detail: "Document was created but could not enter processing state.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        doc = await repo.GetByIdAsync(doc.Id, cancellationToken) ?? doc;

        if (!await DocumentIngestPublish.PublishUploadedOrMarkFailedAsync(doc, repo, messageBroker, logger, cancellationToken))
        {
            return Results.Problem(
                detail: "Document entered processing but the upload event could not be published.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Created($"/api/documents/{doc.Id}", doc);
    }

    private static async Task<IResult> RetryDocument(
        Guid id,
        DocumentRetryDto? dto,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        if (existing.Status is not DocumentStatus.Failed and not DocumentStatus.Ready)
        {
            return Results.Conflict(new { error = "Only failed or ready documents can be retried." });
        }

        if (!TryNormalizeOcrLang(dto?.OcrLang, out var ocrLang))
        {
            return Results.BadRequest(new { error = "Invalid OCR language code." });
        }

        if (string.Equals(existing.ErrorReason, OcrLanguageNeeded, StringComparison.Ordinal)
            && ocrLang is null)
        {
            return Results.BadRequest(new { error = "Choose an OCR language to retry." });
        }

        var doc = await repo.ClaimRetryAsync(id, ocrLang, updateOcrLang: true, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new { error = "Only failed or ready documents can be retried." });
        }

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        var fullRetry = IngestRetryPolicy.ShouldResetIngest(existing.ErrorReason);
        if (!await DocumentIngestPublish.PublishUploadedOrMarkFailedAsync(doc, repo, messageBroker, logger, cancellationToken, retry: fullRetry))
        {
            return Results.Problem(
                detail: "Retry could not be queued.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        doc = await repo.CompleteRetryAsync(doc.Id, cancellationToken) ?? doc;
        return Results.Ok(doc);
    }

    private static async Task<IResult> SetOcrLang(
        Guid id,
        DocumentRetryDto? dto,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        if (!TryNormalizeOcrLang(dto?.OcrLang, out var ocrLang))
        {
            return Results.BadRequest(new { error = "Invalid OCR language code." });
        }

        if (string.Equals(existing.ErrorReason, OcrLanguageNeeded, StringComparison.Ordinal)
            && ocrLang is null)
        {
            return Results.BadRequest(new { error = "Choose an OCR language." });
        }

        var doc = await repo.ClaimOcrLangAsync(id, ocrLang, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new
            {
                error = "OCR language can only be changed while extracting, paused, or after language detection failed.",
            });
        }

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        if (!await DocumentIngestPublish.PublishUploadedOrMarkFailedAsync(doc, repo, messageBroker, logger, cancellationToken, retry: true))
        {
            return Results.Problem(
                detail: "OCR language change could not be queued.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        doc = await repo.CompleteRetryAsync(doc.Id, cancellationToken) ?? doc;
        return Results.Ok(doc);
    }

    private static async Task<IResult> PauseDocument(
        Guid id,
        DocumentRepository repo,
        MessageBroker messageBroker,
        CancellationToken cancellationToken)
    {
        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        if (existing.Status is not DocumentStatus.Processing)
        {
            return Results.Conflict(new { error = "Only processing documents can be paused." });
        }

        await messageBroker.PublishDocumentPauseAsync(id, cancellationToken);
        return Results.Accepted($"/api/documents/{id}", existing);
    }

    private static async Task<IResult> ResumeDocument(
        Guid id,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        if (existing.Status is not DocumentStatus.Paused)
        {
            return Results.Conflict(new { error = "Only paused documents can be resumed." });
        }

        var doc = await repo.ClaimResumeAsync(id, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new { error = "Only paused documents can be resumed." });
        }

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        if (!await DocumentIngestPublish.PublishUploadedOrMarkFailedAsync(doc, repo, messageBroker, logger, cancellationToken))
        {
            return Results.Problem(
                detail: "Resume could not be queued.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Ok(doc);
    }

    private static async Task<IResult> FailStaleProcessing(
        DocumentRepository repo,
        IConfiguration config,
        int? minutes,
        CancellationToken cancellationToken = default)
    {
        var staleMinutes = minutes ?? MaintenanceSettings.FailStaleMinutes(config);
        if (staleMinutes < 1)
        {
            return Results.BadRequest(new { error = "minutes must be >= 1" });
        }

        var failed = await repo.FailStaleProcessingAsync(staleMinutes, cancellationToken);
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

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        var retried = 0;

        foreach (var id in candidates)
        {
            var existing = await repo.GetByIdAsync(id, cancellationToken);
            if (existing is null)
            {
                continue;
            }

            var fullRetry = IngestRetryPolicy.ShouldResetIngest(existing.ErrorReason);
            var doc = await repo.ClaimRetryAsync(id, ocrLang: null, updateOcrLang: false, cancellationToken);
            if (doc is null)
            {
                continue;
            }

            if (!await DocumentIngestPublish.PublishUploadedOrMarkFailedAsync(
                    doc,
                    repo,
                    messageBroker,
                    logger,
                    cancellationToken,
                    retry: fullRetry))
            {
                continue;
            }

            await repo.CompleteRetryAsync(doc.Id, cancellationToken);
            retried++;
        }

        return Results.Ok(new { retried });
    }

    private static async Task<IResult> DeleteDocument(
        Guid id,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        try
        {
            await messageBroker.PublishDocumentDeletedAsync(id, cancellationToken);
        }
        catch (Exception ex)
        {
            var logger = loggerFactory.CreateLogger("DocumentEndpoints");
            logger.LogError(ex, "Failed to publish document.deleted for {DocumentId}", id);
            return Results.Problem(
                detail: "The delete event could not be published; document was not removed.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        if (!await repo.DeleteAsync(id, cancellationToken))
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        return Results.Ok(new
        {
            success = true,
            message = "Document deleted successfully"
        });
    }

    private static bool TryNormalizeOcrLang(string? ocrLang, out string? normalized)
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

        if (value.Length is < 2 or > 32)
        {
            return false;
        }

        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            var ok = c is >= 'a' and <= 'z'
                || (i > 0 && (c is >= '0' and <= '9' or '_' or '+'));
            if (!ok)
            {
                return false;
            }
        }

        normalized = value;
        return true;
    }
}

public record DocumentCreateDto(string Title, string FilePath);

public record DocumentRetryDto(string? OcrLang = null);
