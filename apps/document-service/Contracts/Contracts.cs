namespace DocumentService.Contracts;

public record Document
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string FilePath { get; init; } = string.Empty;
    public DocumentStatus Status { get; init; }
    public Guid? UploadedBy { get; init; }
    public string? ErrorReason { get; init; }
    public int RetryCount { get; init; }
    public string? ProgressStage { get; init; }
    public int? ProgressDone { get; init; }
    public int? ProgressTotal { get; init; }
    public string? OcrLang { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

public enum DocumentStatus
{
    Uploading,
    Processing,
    Paused,
    Ready,
    Failed
}

public record DocumentChunk
{
    public long Id { get; init; }
    public Guid DocumentId { get; init; }
    public int ChunkIndex { get; init; }
    public string Content { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
}

public record DocumentUploadedEvent
{
    public string Type => "document.uploaded";
    public Guid DocumentId { get; init; }
    public string FilePath { get; init; } = string.Empty;
    public string UserId { get; init; } = string.Empty;
    public string? OcrLang { get; init; }
    public bool Retry { get; init; }
    public bool ResetIngest { get; init; }
    public DateTime Timestamp { get; init; }
}

public record DocumentProcessedEvent
{
    public string Type => "document.processed";
    public Guid DocumentId { get; init; }
    public int ChunkCount { get; init; }
    public string? OcrLang { get; init; }
    public DateTime Timestamp { get; init; }
}

public record DocumentFailedEvent
{
    public string Type => "document.failed";
    public Guid DocumentId { get; init; }
    public string ErrorReason { get; init; } = string.Empty;
    public DateTime Timestamp { get; init; }
}

public record DocumentPauseEvent
{
    public string Type => "document.pause";
    public Guid DocumentId { get; init; }
    public DateTime Timestamp { get; init; }
}

public record DocumentPausedEvent
{
    public string Type => "document.paused";
    public Guid DocumentId { get; init; }
    public DateTime Timestamp { get; init; }
}

public record DocumentProgressEvent
{
    public string Type => "document.progress";
    public Guid DocumentId { get; init; }
    public string Stage { get; init; } = string.Empty;
    public int Done { get; init; }
    public int Total { get; init; }
    public DateTime Timestamp { get; init; }
}

public record DocumentDeletedEvent
{
    public string Type => "document.deleted";
    public Guid DocumentId { get; init; }
    public DateTime Timestamp { get; init; }
}
