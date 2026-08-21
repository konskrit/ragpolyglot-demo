using System.Text.Json;
using DemoRAGPolyglot.Shared.Contracts;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DocumentService.Services;

public sealed class MessageBroker : IAsyncDisposable
{
    public const string ExchangeName = "document.events";

    public const string UploadedQueue = "document.uploaded.queue";
    public const string DeletedQueue = "document.deleted.queue";
    public const string ProcessedQueue = "document.processed.queue";
    public const string FailedQueue = "document.failed.queue";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly ConnectionFactory _factory;
    private readonly ILogger<MessageBroker> _logger;
    private readonly SemaphoreSlim _publishLock = new(1, 1);
    private readonly SemaphoreSlim _initLock = new(1, 1);

    private IConnection? _connection;
    private IChannel? _publishingChannel;
    private IChannel? _processedChannel;
    private IChannel? _failedChannel;
    private bool _initialized;

    public MessageBroker(ConnectionFactory factory, ILogger<MessageBroker> logger)
    {
        _factory = factory;
        _logger = logger;
    }

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

            _connection = await _factory.CreateConnectionAsync(cancellationToken);
            _publishingChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);

            await _publishingChannel.ExchangeDeclareAsync(
                exchange: ExchangeName,
                type: ExchangeType.Topic,
                durable: true,
                cancellationToken: cancellationToken);

            await DeclareAndBindQueueAsync(_publishingChannel, UploadedQueue, "document.uploaded", cancellationToken);
            await DeclareAndBindQueueAsync(_publishingChannel, DeletedQueue, "document.deleted", cancellationToken);
            await DeclareAndBindQueueAsync(_publishingChannel, ProcessedQueue, "document.processed", cancellationToken);
            await DeclareAndBindQueueAsync(_publishingChannel, FailedQueue, "document.failed", cancellationToken);

            _initialized = true;
            _logger.LogInformation("Message broker initialized (exchange: {Exchange})", ExchangeName);
        }
        finally
        {
            _initLock.Release();
        }
    }

    public Task PublishDocumentUploadedAsync(Guid documentId, string filePath, CancellationToken cancellationToken = default)
    {
        var message = new DocumentUploadedEvent
        {
            DocumentId = documentId,
            FilePath = filePath,
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

    public async Task StartConsumingAsync(
        Func<DocumentProcessedEvent, Task> onProcessed,
        Func<DocumentFailedEvent, Task> onFailed,
        CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);

        if (_connection is null)
        {
            throw new InvalidOperationException("RabbitMQ connection is not initialized.");
        }

        _processedChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);
        _failedChannel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);

        await BindConsumerAsync(
            _processedChannel,
            ProcessedQueue,
            async body =>
            {
                var message = JsonSerializer.Deserialize<DocumentProcessedEvent>(body, JsonOptions)
                    ?? throw new InvalidOperationException("Failed to deserialize document.processed event");
                await onProcessed(message);
            },
            cancellationToken);

        await BindConsumerAsync(
            _failedChannel,
            FailedQueue,
            async body =>
            {
                var message = JsonSerializer.Deserialize<DocumentFailedEvent>(body, JsonOptions)
                    ?? throw new InvalidOperationException("Failed to deserialize document.failed event");
                await onFailed(message);
            },
            cancellationToken);

        _logger.LogInformation("Started consuming {ProcessedQueue} and {FailedQueue}", ProcessedQueue, FailedQueue);
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

    private async Task BindConsumerAsync(
        IChannel channel,
        string queueName,
        Func<byte[], Task> handler,
        CancellationToken cancellationToken)
    {
        var consumer = new AsyncEventingBasicConsumer(channel);

        consumer.ReceivedAsync += async (_, ea) =>
        {
            try
            {
                var body = ea.Body.ToArray();
                await handler(body);
                await channel.BasicAckAsync(ea.DeliveryTag, multiple: false, cancellationToken: CancellationToken.None);
            }
            catch (Exception ex) when (IsPoisonMessage(ex))
            {
                _logger.LogError(ex, "Dropping poison message from {Queue}", queueName);
                await channel.BasicNackAsync(
                    ea.DeliveryTag,
                    multiple: false,
                    requeue: false,
                    cancellationToken: CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Transient failure handling message from {Queue}; requeueing", queueName);
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

    private static bool IsPoisonMessage(Exception ex) =>
        MessageClassification.IsPoison(ex);

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

            _logger.LogInformation("Published {RoutingKey}", routingKey);
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
        GC.SuppressFinalize(this);
    }
}
