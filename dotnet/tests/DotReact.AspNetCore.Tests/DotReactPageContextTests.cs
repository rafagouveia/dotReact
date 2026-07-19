using System.Globalization;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactPageContextTests
{
    [Fact]
    public void GetQueryValue_throws_when_required_value_is_missing()
    {
        var context = CreateContext();

        var exception = Assert.Throws<InvalidOperationException>(() => context.GetQueryValue<int>("page"));

        Assert.Equal("Query string value 'page' was not provided.", exception.Message);
    }

    [Fact]
    public void GetQueryValue_returns_null_when_nullable_value_is_missing()
    {
        var context = CreateContext();

        var value = context.GetQueryValue<int?>("page");

        Assert.Null(value);
    }

    [Fact]
    public void GetQueryValue_throws_clear_bad_request_for_invalid_value()
    {
        var context = CreateContext("?page=not-a-number");

        var exception = Assert.Throws<BadHttpRequestException>(() => context.GetQueryValue<int>("page"));

        Assert.Equal("Query string value 'page' is not a valid Int32.", exception.Message);
        Assert.NotNull(exception.InnerException);
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData("FALSE", false)]
    public void GetQueryValue_converts_booleans(string text, bool expected)
    {
        var context = CreateContext($"?enabled={text}");

        Assert.Equal(expected, context.GetQueryValue<bool>("enabled"));
    }

    [Theory]
    [InlineData("draft", QueryStatus.Draft)]
    [InlineData("PUBLISHED", QueryStatus.Published)]
    public void GetQueryValue_converts_enums_case_insensitively(string text, QueryStatus expected)
    {
        var context = CreateContext($"?status={text}");

        Assert.Equal(expected, context.GetQueryValue<QueryStatus>("status"));
    }

    [Fact]
    public void GetQueryValue_converts_numbers_using_invariant_culture()
    {
        var originalCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("pt-BR");
            var context = CreateContext("?count=42&price=1234.5");

            Assert.Equal(42, context.GetQueryValue<int>("count"));
            Assert.Equal(1234.5m, context.GetQueryValue<decimal>("price"));
        }
        finally
        {
            CultureInfo.CurrentCulture = originalCulture;
        }
    }

    [Fact]
    public void GetQueryValue_converts_present_nullable_values()
    {
        var context = CreateContext("?page=7");

        Assert.Equal(7, context.GetQueryValue<int?>("page"));
    }

    [Fact]
    public void GetQueryValue_rejects_multiple_scalar_values()
    {
        var context = CreateContext("?page=1&page=2");

        var exception = Assert.Throws<InvalidOperationException>(() => context.GetQueryValue<int>("page"));

        Assert.Equal("Query string value 'page' must be provided exactly once.", exception.Message);
    }

    [Fact]
    public void GetQueryValue_rejects_blank_names()
    {
        var context = CreateContext();

        Assert.Throws<ArgumentException>(() => context.GetQueryValue<int>(" "));
    }

    private static DotReactPageContext CreateContext(string queryString = "")
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.QueryString = new QueryString(queryString);
        return new DotReactPageContext(httpContext);
    }

    public enum QueryStatus
    {
        Draft,
        Published
    }
}
