using System.Text.Json;
using System.Text.Json.Serialization;
using DocumentService.Data;
using DocumentService.Services;
using Npgsql;
using RabbitMQ.Client;

namespace DocumentService.Configuration;

public static class ServiceCollectionExtensions
{
    public static void AddApplicationServices(this WebApplicationBuilder builder)
    {
        builder.Services.AddOpenApi();
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        });

        var connectionString = builder.Configuration.GetConnectionString("Default")
            ?? "Host=localhost;Port=5432;Database=app_db;Username=postgres;Password=postgres";

        builder.Services.AddScoped(_ => new NpgsqlConnection(connectionString));
        builder.Services.AddScoped<DocumentRepository>();

        var rabbitMqHost = builder.Configuration["RABBITMQ_HOST"] ?? "localhost";
        var rabbitMqPort = int.Parse(builder.Configuration["RABBITMQ_PORT"] ?? "5672");
        var rabbitMqUser = builder.Configuration["RABBITMQ_USER"] ?? "guest";
        var rabbitMqPass = builder.Configuration["RABBITMQ_PASS"] ?? "guest";

        builder.Services.AddSingleton(new ConnectionFactory
        {
            HostName = rabbitMqHost,
            Port = rabbitMqPort,
            UserName = rabbitMqUser,
            Password = rabbitMqPass
        });

        builder.Services.AddSingleton<MessageBroker>();
        builder.Services.AddHostedService<EventConsumerBackgroundService>();
    }
}
