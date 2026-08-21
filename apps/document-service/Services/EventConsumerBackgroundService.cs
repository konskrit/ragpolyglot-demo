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
        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        if (await repo.MarkReadyAsync(evt.DocumentId))
        {
            LogMarkedReady(evt.DocumentId, evt.ChunkCount);
        }
        else
        {
            LogProcessedNotFound(evt.DocumentId);
        }
    }

    private async Task HandleDocumentFailedAsync(DocumentFailedEvent evt)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        if (await repo.MarkFailedAsync(evt.DocumentId))
        {
            LogMarkedFailed(evt.DocumentId, evt.ErrorReason);
        }
        else
        {
            LogFailedNotFound(evt.DocumentId);
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

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} not found for document.processed event")]
    private partial void LogProcessedNotFound(Guid documentId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} marked as failed: {ErrorReason}")]
    private partial void LogMarkedFailed(Guid documentId, string errorReason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Document {DocumentId} not found for document.failed event")]
    private partial void LogFailedNotFound(Guid documentId);
}
