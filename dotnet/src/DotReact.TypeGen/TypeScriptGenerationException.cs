namespace DotReact.TypeGen;

public sealed class TypeScriptGenerationException : Exception
{
    public TypeScriptGenerationException(string message)
        : base(message)
    {
    }
}
