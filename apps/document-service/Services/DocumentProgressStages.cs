namespace DocumentService.Services;

public static class DocumentProgressStages
{
    public static bool IsValid(string? stage) => stage is "extracting" or "embedding";
}
