namespace DotReact.AspNetCore;

/// <summary>Represents an unsuccessful or invalid response from the renderer.</summary>
public sealed class DotReactRendererException : Exception
{
    /// <summary>Creates an exception with a renderer-safe diagnostic message.</summary>
    public DotReactRendererException(string message) : base(message) { }

    /// <summary>Creates an exception that wraps a renderer transport or serialization error.</summary>
    public DotReactRendererException(string message, Exception innerException) : base(message, innerException) { }
}
