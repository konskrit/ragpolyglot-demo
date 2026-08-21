using DocumentService.Configuration;
using DocumentService.Data;
using DocumentService.Services;
using Microsoft.AspNetCore.Diagnostics;
using Npgsql;

EnvFile.LoadFromAncestors();

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
