using DocumentService.Contracts;
using DocumentService.Data;

namespace DocumentService.Services;

public static class DocumentUploadPublisher
{
    public static async Task<bool> TryPublishOrMarkFailedAsync(
        Document doc,
        DocumentRepository repo,
        MessageBroker messageBroker,
        ILogger logger,
        CancellationToken cancellationToken,
        bool retry = false,
        bool resetIngest = false)
    {
        try
        {
            await messageBroker.PublishDocumentUploadedAsync(
                doc.Id,
                doc.FilePath,
                doc.OcrLang,
                retry,
                resetIngest,
                cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to publish document.uploaded for {DocumentId}", doc.Id);
            await repo.MarkFailedAsync(doc.Id, "publish_error", cancellationToken);
            return false;
        }
    }
}
