namespace DotReact.AspNetCore;

/// <summary>Represents an unsuccessful or invalid response from the renderer.</summary>
public class DotReactRendererException : Exception
{
    /// <summary>Creates an exception with a renderer-safe diagnostic message.</summary>
    public DotReactRendererException(string message) : base(message) { }

    /// <summary>Creates an exception that wraps a renderer transport or serialization error.</summary>
    public DotReactRendererException(string message, Exception innerException) : base(message, innerException) { }
}

/// <summary>Represents a renderer transport that could not be reached after bounded retries.</summary>
public sealed class DotReactRendererUnavailableException : DotReactRendererException
{
    /// <summary>Creates an unavailable-renderer exception while preserving diagnostics for server logs.</summary>
    public DotReactRendererUnavailableException(string message, Exception innerException)
        : base(message, innerException) { }
}
