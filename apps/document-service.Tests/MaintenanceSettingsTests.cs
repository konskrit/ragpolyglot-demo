using DocumentService.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace DocumentService.Tests;

public class MaintenanceSettingsTests
{
    [Fact]
    public void Uses_defaults_when_env_missing()
    {
        var config = new ConfigurationBuilder().Build();

        Assert.Equal(3, MaintenanceSettings.AutoRetryMaxRetries(config));
        Assert.Equal(1, MaintenanceSettings.AutoRetryMinAgeMinutes(config));
        Assert.Equal(10, MaintenanceSettings.AutoRetryLimit(config));
        Assert.Equal(10, MaintenanceSettings.FailStaleMinutes(config));
    }

    [Fact]
    public void Reads_env_overrides()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AUTO_RETRY_MAX_RETRIES"] = "5",
                ["AUTO_RETRY_MIN_AGE_MINUTES"] = "2",
                ["AUTO_RETRY_LIMIT"] = "20",
                ["FAIL_STALE_MINUTES"] = "15",
            })
            .Build();

        Assert.Equal(5, MaintenanceSettings.AutoRetryMaxRetries(config));
        Assert.Equal(2, MaintenanceSettings.AutoRetryMinAgeMinutes(config));
        Assert.Equal(20, MaintenanceSettings.AutoRetryLimit(config));
        Assert.Equal(15, MaintenanceSettings.FailStaleMinutes(config));
    }
}
