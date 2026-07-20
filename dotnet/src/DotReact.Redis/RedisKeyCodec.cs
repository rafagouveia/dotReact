using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace DotReact.Redis;

internal sealed class RedisKeyCodec(IOptions<DotReactRedisOptions> options)
{
    private readonly string _prefix = options.Value.KeyPrefix;

    public string Artifact(string buildId, string path) =>
        $"{_prefix}:{{prerender-{Hash(buildId)}}}:artifact:{Hash(path)}";

    public string Tag(string buildId, string tag) =>
        $"{_prefix}:{{prerender-{Hash(buildId)}}}:tag:{Hash(tag)}";

    public string IdempotencyResult(string scope, string key)
    {
        var slot = Hash(scope + "\n" + key);
        return $"{_prefix}:{{action-{slot}}}:result";
    }

    public string IdempotencyLock(string scope, string key)
    {
        var slot = Hash(scope + "\n" + key);
        return $"{_prefix}:{{action-{slot}}}:lock";
    }

    public string Session(string sessionId) => $"{_prefix}:session:{Hash(sessionId)}";

    public string SessionRevokedBefore(string subject) =>
        $"{_prefix}:session-subject:{Hash(subject)}:revoked-before";

    public string SessionSubject(string subject) => Hash(subject);

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
