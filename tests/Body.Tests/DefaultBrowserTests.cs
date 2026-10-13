using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>
/// 6.27 (his yes, 2026-10-13): links from Windows. Only the one argument after "--", only http or https, so a link
/// dressed up as a startup switch can never reach the pet or the browser as one.
/// </summary>
public class DefaultBrowserTests
{
    [Theory]
    [InlineData("https://www.wowhead.com/classic", "https://www.wowhead.com/classic")]
    [InlineData("http://example.com/a b", "http://example.com/a%20b")]
    public void A_plain_web_address_is_taken(string arg, string want) =>
        Assert.Equal(want, DefaultBrowser.UrlFrom(new[] { "--url", "--", arg }));

    [Theory]
    [InlineData("--dpi=400")]
    [InlineData("--register-browser")]
    [InlineData("file:///C:/Windows/System32/calc.exe")]
    [InlineData("javascript:alert(1)")]
    [InlineData("ms-settings:privacy")]
    [InlineData("chrome://settings")]
    [InlineData("")]
    public void Anything_else_is_refused(string arg) =>
        Assert.Null(DefaultBrowser.UrlFrom(new[] { "--url", "--", arg }));

    [Fact]
    public void Only_exactly_one_argument_after_the_double_dash()
    {
        Assert.Null(DefaultBrowser.UrlFrom(new[] { "--url", "--", "https://a.com", "--dpi=400" }));
        Assert.Null(DefaultBrowser.UrlFrom(new[] { "--url", "https://a.com" }));
        Assert.Null(DefaultBrowser.UrlFrom(new[] { "https://a.com" }));
    }
}
