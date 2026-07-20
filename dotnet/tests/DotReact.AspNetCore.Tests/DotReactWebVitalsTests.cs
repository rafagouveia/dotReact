using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactWebVitalsTests
{
    [Fact]
    public async Task Valid_sample_is_bounded_and_recorded_without_high_cardinality_route_tags()
    {
        var observed = new List<(string Name, double Value, KeyValuePair<string, object?>[] Tags)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == DotReactTelemetry.MeterName
                && instrument.Name.StartsWith("dotreact.browser.", StringComparison.Ordinal))
                meterListener.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) =>
            observed.Add((instrument.Name, value, tags.ToArray())));
        listener.Start();

        await using var app = await StartAppAsync();
        var response = await app.GetTestClient().PostAsJsonAsync("/_dotreact/vitals", new
        {
            name = "LCP",
            value = 2345.5,
            rating = "poor",
            navigationType = "navigate"
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var metric = Assert.Single(observed);
        Assert.Equal("dotreact.browser.lcp", metric.Name);
        Assert.Equal(2345.5, metric.Value);
        Assert.Equal(["dotreact.rating", "dotreact.navigation_type"], metric.Tags.Select(tag => tag.Key));
        Assert.Equal("good", metric.Tags.Single(tag => tag.Key == "dotreact.rating").Value);
    }

    [Fact]
    public async Task Invalid_or_oversized_samples_are_rejected()
    {
        await using var app = await StartAppAsync();
        var client = app.GetTestClient();
        var invalid = await client.PostAsJsonAsync("/_dotreact/vitals", new
        {
            name = "CUSTOM",
            value = 1,
            rating = "good",
            navigationType = "navigate"
        });
        using var oversizedContent = new StringContent(
            "{\"name\":\"LCP\",\"value\":1,\"rating\":\"good\",\"navigationType\":\"navigate\",\"padding\":\""
            + new string('x', 4_096) + "\"}",
            System.Text.Encoding.UTF8,
            "application/json");
        var oversized = await client.PostAsync("/_dotreact/vitals", oversizedContent);

        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, oversized.StatusCode);
    }

    private static async Task<WebApplication> StartAppAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDotReact();
        var app = builder.Build();
        app.MapDotReactWebVitals();
        await app.StartAsync();
        return app;
    }
}
