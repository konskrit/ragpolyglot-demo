namespace DocumentService.Services;

public sealed partial class MessageBroker
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Message broker initialized (exchange: {Exchange})")]
    private partial void LogInitialized(string exchange);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Waiting for RabbitMQ")]
    private partial void LogWaiting(Exception ex);

    [LoggerMessage(Level = LogLevel.Information, Message = "Started consuming {ProcessedQueue}, {FailedQueue}, {PausedQueue}, and {ProgressQueue}")]
    private partial void LogConsuming(string processedQueue, string failedQueue, string pausedQueue, string progressQueue);

    [LoggerMessage(Level = LogLevel.Error, Message = "Dropping poison message from {Queue}")]
    private partial void LogPoison(Exception ex, string queue);

    [LoggerMessage(Level = LogLevel.Error, Message = "Transient failure handling message from {Queue}; requeueing")]
    private partial void LogTransient(Exception ex, string queue);

    [LoggerMessage(Level = LogLevel.Information, Message = "Published {RoutingKey}")]
    private partial void LogPublished(string routingKey);
}
