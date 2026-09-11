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
        app.MapGet("/api/documents/{id:guid}/summary", GetDocumentSummary);
        app.MapPost("/api/documents", CreateDocument);
        app.MapPost("/api/documents/{id:guid}/retry", RetryDocument);
        app.MapPost("/api/documents/{id:guid}/ocr-lang", SetOcrLang);
        app.MapPost("/api/documents/{id:guid}/pause", PauseDocument);
        app.MapPost("/api/documents/{id:guid}/resume", ResumeDocument);
        app.MapPost("/api/documents/{id:guid}/rename", RenameDocument);
        app.MapPost("/api/documents/{id:guid}/summarize", StartSummarize);
        app.MapPost("/api/documents/{id:guid}/summarize/pause", PauseSummarize);
        app.MapPost("/api/documents/{id:guid}/summarize/resume", ResumeSummarize);
        app.MapDelete("/api/documents/{id:guid}", DeleteDocument);
        app.MapDocumentMaintenanceEndpoints();
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

    private static async Task<IResult> GetDocumentSummary(Guid id, DocumentRepository repo, CancellationToken cancellationToken)
    {
        var content = await repo.GetSummaryAsync(id, cancellationToken);
        return Results.Ok(new { summary = content });
    }

    private static async Task<IResult> CreateDocument(
        DocumentCreateDto dto,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        if (!DocumentTitles.TryNormalize(dto.Title, out var title))
        {
            return Results.BadRequest(new { error = DocumentTitles.RequiredMessage });
        }

        if (string.IsNullOrWhiteSpace(dto.FilePath))
        {
            return Results.BadRequest(new { error = "FilePath is required." });
        }

        var doc = await repo.CreateAsync(title, dto.FilePath.Trim(), cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new { error = DocumentTitles.DuplicateMessage });
        }

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        await repo.MarkProcessingAsync(doc.Id, cancellationToken);

        if (!await DocumentUploadPublisher.TryPublishOrMarkFailedAsync(
                doc, repo, messageBroker, logger, cancellationToken))
        {
            return Results.Problem(
                detail: "Document was created but the upload event could not be published.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        doc = await repo.GetByIdAsync(doc.Id, cancellationToken) ?? doc;
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

        if (!IngestRetryPolicy.TryNormalizeOcrLang(dto?.OcrLang, out var ocrLang))
        {
            return Results.BadRequest(new { error = "Invalid OCR language code." });
        }

        if (string.Equals(existing.ErrorReason, OcrLanguageNeeded, StringComparison.Ordinal)
            && ocrLang is null)
        {
            return Results.BadRequest(new { error = "Choose an OCR language to retry." });
        }

        var resetIngest = IngestRetryPolicy.OcrLangChanged(existing.OcrLang, ocrLang);
        var doc = await repo.ClaimRetryAsync(id, ocrLang, updateOcrLang: true, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new { error = "Only failed or ready documents can be retried." });
        }

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        if (!await DocumentUploadPublisher.TryPublishOrMarkFailedAsync(
                doc, repo, messageBroker, logger, cancellationToken,
                retry: true, resetIngest: resetIngest))
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

        if (!IngestRetryPolicy.TryNormalizeOcrLang(dto?.OcrLang, out var ocrLang))
        {
            return Results.BadRequest(new { error = "Invalid OCR language code." });
        }

        if (string.Equals(existing.ErrorReason, OcrLanguageNeeded, StringComparison.Ordinal)
            && ocrLang is null)
        {
            return Results.BadRequest(new { error = "Choose an OCR language." });
        }

        var resetIngest = IngestRetryPolicy.OcrLangChanged(existing.OcrLang, ocrLang);
        var doc = await repo.ClaimOcrLangAsync(id, ocrLang, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new
            {
                error = "OCR language can only be changed while OCR is queued/running, paused, or after language detection failed.",
            });
        }

        var logger = loggerFactory.CreateLogger("DocumentEndpoints");
        if (!await DocumentUploadPublisher.TryPublishOrMarkFailedAsync(
                doc, repo, messageBroker, logger, cancellationToken,
                retry: true, resetIngest: resetIngest))
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

        if (!await repo.MarkPausedAsync(id, cancellationToken))
        {
            return Results.Conflict(new { error = "Only processing documents can be paused." });
        }

        await messageBroker.PublishDocumentPauseAsync(id, cancellationToken);
        var paused = await repo.GetByIdAsync(id, cancellationToken);
        return Results.Ok(paused ?? existing with { Status = DocumentStatus.Paused });
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
        if (!await DocumentUploadPublisher.TryPublishOrMarkFailedAsync(
                doc, repo, messageBroker, logger, cancellationToken))
        {
            return Results.Problem(
                detail: "Resume could not be queued.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Ok(doc);
    }

    private static async Task<IResult> RenameDocument(
        Guid id,
        DocumentRenameDto? dto,
        DocumentRepository repo,
        CancellationToken cancellationToken)
    {
        if (!DocumentTitles.TryNormalize(dto?.Title, out var title))
        {
            return Results.BadRequest(new { error = DocumentTitles.RequiredMessage });
        }

        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        if (string.Equals(existing.Title, title, StringComparison.Ordinal))
        {
            return Results.Ok(existing);
        }

        var doc = await repo.RenameAsync(id, title, cancellationToken);
        if (doc is null)
        {
            return await repo.GetByIdAsync(id, cancellationToken) is null
                ? Results.NotFound(new { error = "Document not found" })
                : Results.Conflict(new { error = DocumentTitles.DuplicateMessage });
        }

        return Results.Ok(doc);
    }

    private static async Task<IResult> StartSummarize(
        Guid id,
        DocumentSummarizeDto? dto,
        DocumentRepository repo,
        MessageBroker messageBroker,
        CancellationToken cancellationToken)
    {
        var existing = await repo.GetByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return Results.NotFound(new { error = "Document not found" });
        }

        if (existing.Status is not DocumentStatus.Ready)
        {
            return Results.Conflict(new { error = "Only ready documents can be summarized." });
        }

        // Only wipe checkpoint on a fresh start. Failed jobs resume from the
        // last saved map/reduce checkpoint (Retry must not throw that away).
        var reset = existing.SummarizeStatus is null;
        var doc = await repo.ClaimSummarizeAsync(id, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new { error = "Summarize is already running or paused." });
        }

        await messageBroker.PublishDocumentSummarizeAsync(
            id,
            dto?.MaxContextChars,
            reset: reset,
            cancellationToken: cancellationToken);

        return Results.Accepted($"/api/documents/{id}", doc);
    }

    private static async Task<IResult> PauseSummarize(
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

        if (!string.Equals(existing.SummarizeStatus, "running", StringComparison.Ordinal))
        {
            return Results.Conflict(new { error = "Only a running summarize job can be paused." });
        }

        if (!await repo.MarkSummarizePausedAsync(id, cancellationToken))
        {
            return Results.Conflict(new { error = "Only a running summarize job can be paused." });
        }

        await messageBroker.PublishDocumentSummarizePauseAsync(id, cancellationToken);
        var paused = await repo.GetByIdAsync(id, cancellationToken);
        return Results.Ok(paused ?? existing with { SummarizeStatus = "paused" });
    }

    private static async Task<IResult> ResumeSummarize(
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

        var doc = await repo.ClaimSummarizeResumeAsync(id, cancellationToken);
        if (doc is null)
        {
            return Results.Conflict(new { error = "Only a paused summarize job can be resumed." });
        }

        await messageBroker.PublishDocumentSummarizeAsync(
            id,
            reset: false,
            cancellationToken: cancellationToken);

        return Results.Ok(doc);
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
                detail: "Delete event could not be published; document was not removed.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        await repo.DeleteAsync(id, cancellationToken);
        return Results.Ok(new { success = true, message = "Document deleted successfully" });
    }
}
