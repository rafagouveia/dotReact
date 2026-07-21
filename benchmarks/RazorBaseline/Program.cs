var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorPages();
builder.Services.AddSingleton(TimeProvider.System);
var app = builder.Build();
app.MapGet("/_health/live", () => Results.Ok());
app.MapRazorPages();
app.Run();
