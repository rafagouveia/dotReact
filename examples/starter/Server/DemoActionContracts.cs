namespace DotReact.Starter;

public sealed record IncrementDemoRequest(int Value);

public sealed record IncrementDemoResponse(int Value, string ExecutedBy);
