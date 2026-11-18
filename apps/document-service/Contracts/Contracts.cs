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
    public string? SummarizeStatus { get; init; }
    public int? SummarizeDone { get; init; }
    public int? SummarizeTotal { get; init; }
    public string? SummarizeError { get; init; }
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
