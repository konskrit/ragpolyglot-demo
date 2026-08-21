using DemoRAGPolyglot.Shared.Contracts;
using DocumentService.Data;
using DocumentService.Services;

namespace DocumentService.Endpoints;

public static class DocumentEndpoints
{
    public static void MapDocumentEndpoints(this WebApplication app)
    {
        app.MapGet("/api/documents", ListDocuments);
        app.MapGet("/api/documents/{id:guid}", GetDocumentById);
        app.MapGet("/api/documents/{id:guid}/chunks", GetDocumentChunks);
        app.MapPost("/api/documents", CreateDocument);
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

        try
        {
            await messageBroker.PublishDocumentUploadedAsync(doc.Id, doc.FilePath, cancellationToken);
        }
        catch (Exception ex)
        {
            var logger = loggerFactory.CreateLogger("DocumentEndpoints");
            logger.LogError(ex, "Failed to publish document.uploaded for {DocumentId}", doc.Id);
            await repo.MarkFailedAsync(doc.Id, cancellationToken);

            return Results.Problem(
                detail: "Document was created but the upload event could not be published.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Created($"/api/documents/{doc.Id}", doc);
    }

    private static async Task<IResult> DeleteDocument(
        Guid id,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var deleted = await repo.DeleteAsync(id, cancellationToken);
        if (!deleted)
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
            logger.LogError(
                ex,
                "Document {DocumentId} deleted from DB but document.deleted publish failed",
                id);

            return Results.Problem(
                detail: "Document was deleted but the delete event could not be published.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Results.Ok(new
        {
            success = true,
            message = "Document deleted successfully"
        });
    }
}

public record DocumentCreateDto(string Title, string FilePath);
