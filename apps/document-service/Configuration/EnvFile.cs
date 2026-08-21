using System.Text;

namespace DocumentService.Configuration;

public static class EnvFile
{
    public static void LoadFromAncestors(int maxDepth = 6)
    {
        var dir = Directory.GetCurrentDirectory();
        for (var i = 0; i < maxDepth; i++)
        {
            var candidate = Path.Combine(dir, ".env");
            if (File.Exists(candidate))
            {
                Apply(candidate);
                return;
            }

            var parent = Directory.GetParent(dir);
            if (parent is null) return;
            dir = parent.FullName;
        }
    }

    private static void Apply(string path)
    {
        foreach (var raw in File.ReadLines(path, Encoding.UTF8))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;

            var eq = line.IndexOf('=');
            if (eq <= 0) continue;

            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();
            if (value.Length >= 2 &&
                ((value.StartsWith('"') && value.EndsWith('"')) ||
                 (value.StartsWith('\'') && value.EndsWith('\''))))
            {
                value = value[1..^1];
            }

            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }
    }
}
