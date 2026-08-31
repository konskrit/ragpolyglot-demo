using DocumentService.Configuration;
using DocumentService.Data;
using DocumentService.Services;
using Microsoft.AspNetCore.Diagnostics;
using Npgsql;

DotNetEnv.Env.NoClobber().TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

builder.AddApplicationServices();

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<NpgsqlConnection>();
    if (db.State != System.Data.ConnectionState.Open)
    {
        await db.OpenAsync();
    }

    await DatabaseInitializer.InitializeDatabaseAsync(db);
}

var messageBroker = app.Services.GetRequiredService<MessageBroker>();
await messageBroker.InitializeAsync();

await using (var scope = app.Services.CreateAsyncScope())
{
    var repo = scope.ServiceProvider.GetRequiredService<DocumentRepository>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    foreach (var doc in await repo.ListProcessingAsync())
    {
        if (await DocumentIngestPublish.PublishUploadedOrMarkFailedAsync(
                doc,
                repo,
                messageBroker,
                logger,
                CancellationToken.None))
        {
            logger.LogInformation("Requeued processing document {DocumentId}", doc.Id);
        }
    }
}

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new
        {
            error = "Internal server error",
            detail = app.Environment.IsDevelopment() ? feature?.Error.Message : null
        });
    });
});

app.MapApplicationEndpoints();

app.Run();
