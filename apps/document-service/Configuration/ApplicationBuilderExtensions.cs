using DocumentService.Data;
using DocumentService.Endpoints;
using DocumentService.Services;

namespace DocumentService.Configuration;

public static class ApplicationBuilderExtensions
{
    public static void MapApplicationEndpoints(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.MapGet("/health", async (
            DocumentRepository repo,
            MessageBroker messageBroker,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await repo.PingAsync(cancellationToken);
            }
            catch
            {
                return Results.Json(
                    new { status = "unhealthy", reason = "database", timestamp = DateTime.UtcNow },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            if (!messageBroker.IsConnected)
            {
                return Results.Json(
                    new { status = "unhealthy", reason = "rabbitmq", timestamp = DateTime.UtcNow },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            return Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
        });

        app.MapDocumentEndpoints();
    }
}
