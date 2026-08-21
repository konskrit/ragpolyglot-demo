using System.Collections.Concurrent;
using System.Reflection;

namespace DocumentService.Sql;

public static class SqlScripts
{
    private static readonly Assembly Assembly = typeof(SqlScripts).Assembly;
    private static readonly ConcurrentDictionary<string, string> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static string Load(string relativePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(relativePath);

        return Cache.GetOrAdd(relativePath, static path =>
        {
            var normalized = path.Replace('\\', '/').TrimStart('/');
            var resourceName = $"DocumentService.Sql.{normalized.Replace('/', '.')}";

            using var stream = Assembly.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                var available = string.Join(", ", Assembly.GetManifestResourceNames());
                throw new InvalidOperationException(
                    $"SQL resource '{resourceName}' was not found. Available: {available}");
            }

            using var reader = new StreamReader(stream);
            return reader.ReadToEnd();
        });
    }
}
