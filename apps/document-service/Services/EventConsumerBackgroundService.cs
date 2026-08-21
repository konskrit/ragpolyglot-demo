using DemoRAGPolyglot.Shared.Contracts;
using DocumentService.Data;

namespace DocumentService.Services;

public sealed class EventConsumerBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly MessageBroker _messageBroker;
    private readonly ILogger<EventConsumerBackgroundService> _logger;

    public EventConsumerBackgroundService(
        IServiceScopeFactory scopeFactory,
        MessageBroker messageBroker,
        ILogger<EventConsumerBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _messageBroker = messageBroker;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Event consumer background service starting...");

        try
        {
            await _messageBroker.InitializeAsync(stoppingToken);
            await _messageBroker.StartConsumingAsync(
                onProcessed: HandleDocumentProcessedAsync,
                onFailed: HandleDocumentFailedAsync,
                cancellationToken: stoppingToken);

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Event consumer background service stopping...");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Event consumer background service failed");
            throw;
        }
    }

    private async Task HandleDocumentProcessedAsync(DocumentProcessedEvent evt)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        if (await repo.MarkReadyAsync(evt.DocumentId))
        {
            _logger.LogInformation(
                "Document {DocumentId} marked as ready ({ChunkCount} chunks)",
                evt.DocumentId,
                evt.ChunkCount);
        }
        else
        {
            _logger.LogWarning(
                "Document {DocumentId} not found for document.processed event",
                evt.DocumentId);
        }
    }

    private async Task HandleDocumentFailedAsync(DocumentFailedEvent evt)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();

        if (await repo.MarkFailedAsync(evt.DocumentId))
        {
            _logger.LogWarning(
                "Document {DocumentId} marked as failed: {ErrorReason}",
                evt.DocumentId,
                evt.ErrorReason);
        }
        else
        {
            _logger.LogWarning(
                "Document {DocumentId} not found for document.failed event",
                evt.DocumentId);
        }
    }
}
