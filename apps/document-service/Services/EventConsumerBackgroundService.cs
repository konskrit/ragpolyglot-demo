using System.Text;
using DocumentService.Contracts;
using DocumentService.Data;

namespace DocumentService.Services;

public sealed partial class EventConsumerBackgroundService(
    IServiceScopeFactory scopeFactory,
    MessageBroker messageBroker,
    ILogger<EventConsumerBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        LogStarting();

        try
        {
            await messageBroker.InitializeAsync(stoppingToken);
            await messageBroker.StartConsumingAsync(
                onProcessed: HandleDocumentProcessedAsync,
                onFailed: HandleDocumentFailedAsync,
                onPaused: HandleDocumentPausedAsync,
                onProgress: HandleDocumentProgressAsync,
                onInvalidPayload: LogInvalidAsync,
                cancellationToken: stoppingToken);

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            LogStopping();
        }
        catch (Exception ex)
        {
            LogFailed(ex);
            throw;
        }
    }

    private async Task HandleDocumentProcessedAsync(DocumentProcessedEvent evt)
    {
        if (evt.DocumentId == Guid.Empty)
        {
            throw new ArgumentException("missing documentId");
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        var ocrLang = string.IsNullOrWhiteSpace(evt.OcrLang) ? null : evt.OcrLang.Trim();
        if (await repo.MarkReadyAsync(evt.DocumentId, ocrLang))
        {
            LogMarkedReady(evt.DocumentId, evt.ChunkCount);
        }
        else
        {
            LogProcessedIgnored(evt.DocumentId);
        }
    }

    private async Task HandleDocumentFailedAsync(DocumentFailedEvent evt)
    {
        if (evt.DocumentId == Guid.Empty)
        {
            throw new ArgumentException("missing documentId");
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        if (await repo.MarkFailedAsync(evt.DocumentId, evt.ErrorReason))
        {
            LogMarkedFailed(evt.DocumentId, evt.ErrorReason);
        }
        else
        {
            LogFailedIgnored(evt.DocumentId);
        }
    }

    private async Task HandleDocumentPausedAsync(DocumentPausedEvent evt)
    {
        if (evt.DocumentId == Guid.Empty)
        {
            throw new ArgumentException("missing documentId");
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        if (await repo.MarkPausedAsync(evt.DocumentId))
        {
            LogMarkedPaused(evt.DocumentId);
        }
        else
        {
            LogPausedNotFound(evt.DocumentId);
        }
    }

    private async Task HandleDocumentProgressAsync(DocumentProgressEvent evt)
    {
        if (evt.DocumentId == Guid.Empty)
        {
            throw new ArgumentException("missing documentId");
        }

        if (!DocumentProgressStages.IsValid(evt.Stage))
        {
            LogProgressIgnored(evt.DocumentId, evt.Stage);
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();
        await repo.UpdateProgressAsync(evt.DocumentId, evt.Stage, evt.Done, evt.Total);
    }

    private async Task LogInvalidAsync(string queue, Exception ex, byte[]? body)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

            var preview = body is { Length: > 0 }
                ? Encoding.UTF8.GetString(body.AsSpan(0, Math.Min(body.Length, 512)))
                : null;

            await repo.LogSystemAsync(
                "invalid_event",
                new { queue, error = ex.Message, preview });

            LogInvalidEvent(queue, ex.Message);
        }
        catch (Exception logEx)
        {
            logger.LogWarning(logEx, "Failed to persist invalid_event for queue {Queue}", queue);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Event consumer background service starting...")]
    private partial void LogStarting();

    [LoggerMessage(Level = LogLevel.Information, Message = "Event consumer background service stopping...")]
    private partial void LogStopping();

    [LoggerMessage(Level = LogLevel.Error, Message = "Event consumer background service failed")]
    private partial void LogFailed(Exception ex);

    [LoggerMessage(Level = LogLevel.Information, Message = "Document {DocumentId} marked as ready ({ChunkCount} chunks)")]
    private partial void LogMarkedReady(Guid documentId, int chunkCount);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} not updated for document.processed event (missing or not processing)")]
    private partial void LogProcessedIgnored(Guid documentId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} marked as failed: {ErrorReason}")]
    private partial void LogMarkedFailed(Guid documentId, string errorReason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} not updated for document.failed event (missing or terminal status)")]
    private partial void LogFailedIgnored(Guid documentId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Document {DocumentId} marked as paused")]
    private partial void LogMarkedPaused(Guid documentId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} not found or not processing for document.paused event")]
    private partial void LogPausedNotFound(Guid documentId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Invalid event from {Queue}: {Error}")]
    private partial void LogInvalidEvent(string queue, string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Ignored document.progress for {DocumentId}: invalid stage {Stage}")]
    private partial void LogProgressIgnored(Guid documentId, string stage);
}
