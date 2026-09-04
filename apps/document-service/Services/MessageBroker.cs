using System.Text.Json;
using DocumentService.Contracts;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DocumentService.Services;

public sealed partial class MessageBroker(
    ConnectionFactory factory,
    ILogger<MessageBroker> logger) : IAsyncDisposable
{
    public const string ExchangeName = "document.events";

    public const string UploadedQueue = "document.uploaded.queue";
    public const string DeletedQueue = "document.deleted.queue";
    public const string PauseQueue = "document.pause.queue";
    public const string ProcessedQueue = "document.processed.queue";
    public const string FailedQueue = "document.failed.queue";
    public const string PausedQueue = "document.paused.queue";
    public const string ProgressQueue = "document.progress.queue";

    private static readonly (string Queue, string RoutingKey)[] Topology =
    [
        (UploadedQueue, "document.uploaded"),
        (DeletedQueue, "document.deleted"),
        (PauseQueue, "document.pause"),
        (ProcessedQueue, "document.processed"),
        (FailedQueue, "document.failed"),
        (PausedQueue, "document.paused"),
        (ProgressQueue, "document.progress"),
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly SemaphoreSlim _publishLock = new(1, 1);
    private readonly SemaphoreSlim _initLock = new(1, 1);

    private IConnection? _connection;
    private IChannel? _publishingChannel;
    private IChannel? _processedChannel;
    private IChannel? _failedChannel;
    private IChannel? _pausedChannel;
    private IChannel? _progressChannel;
    private bool _initialized;

    public bool IsConnected => _connection is { IsOpen: true };

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_initialized)
        {
            return;
        }

        await _initLock.WaitAsync(cancellationToken);
        try
        {
            if (_initialized)
            {
                return;
            }

            var waiting = false;
            while (!_initialized)
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    _connection = await factory.CreateConnectionAsync(cancellationToken);
                    _publishingChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);

                    await _publishingChannel.ExchangeDeclareAsync(
                        exchange: ExchangeName,
                        type: ExchangeType.Topic,
                        durable: true,
                        cancellationToken: cancellationToken);

                    foreach (var (queue, routingKey) in Topology)
                    {
                        await DeclareAndBindQueueAsync(_publishingChannel, queue, routingKey, cancellationToken);
                    }

                    _initialized = true;
                    LogInitialized(ExchangeName);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    await CleanupPartialInitAsync();
                    if (!waiting)
                    {
                        waiting = true;
                        LogWaiting(ex);
                    }
                    await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                }
            }
        }
        finally
        {
            _initLock.Release();
        }
    }

    private async Task CleanupPartialInitAsync()
    {
        if (_publishingChannel is not null)
        {
            await _publishingChannel.DisposeAsync();
            _publishingChannel = null;
        }

        if (_connection is not null)
        {
            await _connection.DisposeAsync();
            _connection = null;
        }
    }

    public Task PublishDocumentUploadedAsync(
        Guid documentId,
        string filePath,
        string? ocrLang,
        bool retry = false,
        bool resetIngest = false,
        CancellationToken cancellationToken = default)
    {
        var message = new DocumentUploadedEvent
        {
            DocumentId = documentId,
            FilePath = filePath,
            OcrLang = ocrLang,
            Retry = retry,
            ResetIngest = resetIngest,
            Timestamp = DateTime.UtcNow
        };

        return SendMessageAsync("document.uploaded", message, cancellationToken);
    }

    public Task PublishDocumentDeletedAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        var message = new DocumentDeletedEvent
        {
            DocumentId = documentId,
            Timestamp = DateTime.UtcNow
        };

        return SendMessageAsync("document.deleted", message, cancellationToken);
    }

    public Task PublishDocumentPauseAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        var message = new DocumentPauseEvent
        {
            DocumentId = documentId,
            Timestamp = DateTime.UtcNow
        };

        return SendMessageAsync("document.pause", message, cancellationToken);
    }

    public async Task StartConsumingAsync(
        Func<DocumentProcessedEvent, Task> onProcessed,
        Func<DocumentFailedEvent, Task> onFailed,
        Func<DocumentPausedEvent, Task> onPaused,
        Func<DocumentProgressEvent, Task> onProgress,
        Func<string, Exception, byte[]?, Task> onInvalidPayload,
        CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);

        if (_connection is null)
        {
            throw new InvalidOperationException("RabbitMQ connection is not initialized.");
        }

        if (_processedChannel is not null)
        {
            await _processedChannel.DisposeAsync();
            _processedChannel = null;
        }

        if (_failedChannel is not null)
        {
            await _failedChannel.DisposeAsync();
            _failedChannel = null;
        }

        if (_pausedChannel is not null)
        {
            await _pausedChannel.DisposeAsync();
            _pausedChannel = null;
        }

        if (_progressChannel is not null)
        {
            await _progressChannel.DisposeAsync();
            _progressChannel = null;
        }

        _processedChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);
        _failedChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);
        _pausedChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);
        _progressChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);

        await BindConsumerAsync(
            _processedChannel,
            ProcessedQueue,
            "document.processed",
            onProcessed,
            onInvalidPayload,
            cancellationToken);

        await BindConsumerAsync(
            _failedChannel,
            FailedQueue,
            "document.failed",
            onFailed,
            onInvalidPayload,
            cancellationToken);

        await BindConsumerAsync(
            _pausedChannel,
            PausedQueue,
            "document.paused",
            onPaused,
            onInvalidPayload,
            cancellationToken);

        await BindConsumerAsync(
            _progressChannel,
            ProgressQueue,
            "document.progress",
            onProgress,
            onInvalidPayload,
            cancellationToken);

        LogConsuming(ProcessedQueue, FailedQueue, PausedQueue, ProgressQueue);
    }

    private static async Task DeclareAndBindQueueAsync(
        IChannel channel,
        string queueName,
        string routingKey,
        CancellationToken cancellationToken)
    {
        await channel.QueueDeclareAsync(
            queue: queueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            cancellationToken: cancellationToken);

        await channel.QueueBindAsync(
            queue: queueName,
            exchange: ExchangeName,
            routingKey: routingKey,
            cancellationToken: cancellationToken);
    }

    private async Task BindConsumerAsync<T>(
        IChannel channel,
        string queueName,
        string eventName,
        Func<T, Task> onMessage,
        Func<string, Exception, byte[]?, Task> onInvalidPayload,
        CancellationToken cancellationToken)
    {
        var consumer = new AsyncEventingBasicConsumer(channel);

        consumer.ReceivedAsync += async (_, ea) =>
        {
            byte[]? body = null;
            try
            {
                body = ea.Body.ToArray();
                var message = JsonSerializer.Deserialize<T>(body, JsonOptions)
                    ?? throw new JsonException($"Failed to deserialize {eventName} event");
                await onMessage(message);
                await channel.BasicAckAsync(ea.DeliveryTag, multiple: false, cancellationToken: CancellationToken.None);
            }
            catch (Exception ex) when (MessageClassification.IsPoison(ex))
            {
                LogPoison(ex, queueName);
                await onInvalidPayload(queueName, ex, body);
                await channel.BasicNackAsync(
                    ea.DeliveryTag,
                    multiple: false,
                    requeue: false,
                    cancellationToken: CancellationToken.None);
            }
            catch (Exception ex)
            {
                LogTransient(ex, queueName);
                await channel.BasicNackAsync(
                    ea.DeliveryTag,
                    multiple: false,
                    requeue: true,
                    cancellationToken: CancellationToken.None);
            }
        };

        await channel.BasicConsumeAsync(
            queue: queueName,
            autoAck: false,
            consumer: consumer,
            cancellationToken: cancellationToken);
    }

    private async Task SendMessageAsync<T>(string routingKey, T message, CancellationToken cancellationToken)
        where T : class
    {
        await InitializeAsync(cancellationToken);

        if (_publishingChannel is null)
        {
            throw new InvalidOperationException("Publishing channel is not initialized.");
        }

        var body = JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions);
        var properties = new BasicProperties
        {
            ContentType = "application/json",
            DeliveryMode = DeliveryModes.Persistent,
            Type = routingKey,
            MessageId = Guid.NewGuid().ToString("N"),
            Timestamp = new AmqpTimestamp(DateTimeOffset.UtcNow.ToUnixTimeSeconds())
        };

        await _publishLock.WaitAsync(cancellationToken);
        try
        {
            await _publishingChannel.BasicPublishAsync(
                exchange: ExchangeName,
                routingKey: routingKey,
                mandatory: false,
                basicProperties: properties,
                body: body,
                cancellationToken: cancellationToken);

            LogPublished(routingKey);
        }
        finally
        {
            _publishLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_processedChannel is not null)
        {
            await _processedChannel.DisposeAsync();
        }

        if (_failedChannel is not null)
        {
            await _failedChannel.DisposeAsync();
        }

        if (_pausedChannel is not null)
        {
            await _pausedChannel.DisposeAsync();
        }

        if (_progressChannel is not null)
        {
            await _progressChannel.DisposeAsync();
        }

        if (_publishingChannel is not null)
        {
            await _publishingChannel.DisposeAsync();
        }

        if (_connection is not null)
        {
            await _connection.DisposeAsync();
        }

        _publishLock.Dispose();
        _initLock.Dispose();
    }
}
