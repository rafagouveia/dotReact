using DotReact.Hosting;

var builder = WebApplication.CreateBuilder(args);
builder.AddDotReactApplication();

var app = builder.Build();
app.UseDotReactApplication();
app.MapDotReactApplication();

app.Run();

public partial class Program;
