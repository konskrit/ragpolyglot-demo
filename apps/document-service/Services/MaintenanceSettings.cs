namespace DocumentService.Services;

public static class MaintenanceSettings
{
    public const int DefaultAutoRetryMaxRetries = 3;
    public const int DefaultAutoRetryMinAgeMinutes = 1;
    public const int DefaultAutoRetryLimit = 10;
    public const int DefaultFailStaleMinutes = 10;

    public static int AutoRetryMaxRetries(IConfiguration config) =>
        ReadPositive(config, "AUTO_RETRY_MAX_RETRIES", DefaultAutoRetryMaxRetries);

    public static int AutoRetryMinAgeMinutes(IConfiguration config) =>
        ReadNonNegative(config, "AUTO_RETRY_MIN_AGE_MINUTES", DefaultAutoRetryMinAgeMinutes);

    public static int AutoRetryLimit(IConfiguration config) =>
        ReadPositive(config, "AUTO_RETRY_LIMIT", DefaultAutoRetryLimit);

    public static int FailStaleMinutes(IConfiguration config) =>
        ReadPositive(config, "FAIL_STALE_MINUTES", DefaultFailStaleMinutes);

    private static int ReadPositive(IConfiguration config, string key, int fallback)
    {
        if (int.TryParse(config[key], out var value) && value > 0)
        {
            return value;
        }

        return fallback;
    }

    private static int ReadNonNegative(IConfiguration config, string key, int fallback)
    {
        if (int.TryParse(config[key], out var value) && value >= 0)
        {
            return value;
        }

        return fallback;
    }
}
