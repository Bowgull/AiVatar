using Aang.Body;
using Xunit;

namespace Aang.Body.Tests;

public class InputHistoryTests
{
    [Fact]
    public void Up_walks_back_through_messages_and_stops_at_the_oldest()
    {
        var h = new InputHistory();
        h.Add("one"); h.Add("two"); h.Add("three");
        Assert.Equal("three", h.Prev(""));
        Assert.Equal("two", h.Prev(""));
        Assert.Equal("one", h.Prev(""));
        Assert.Equal("one", h.Prev(""));           // nothing older: stay on the oldest
    }

    [Fact]
    public void Down_walks_forward_and_returns_the_half_typed_draft()
    {
        var h = new InputHistory();
        h.Add("one"); h.Add("two");
        Assert.Equal("two", h.Prev("half typed"));
        Assert.Equal("one", h.Prev("two"));
        Assert.Equal("two", h.Next());
        Assert.Equal("half typed", h.Next());      // past the newest: the draft comes back
        Assert.Null(h.Next());                      // no longer browsing
        Assert.False(h.Browsing);
    }

    [Fact]
    public void Blank_and_immediately_repeated_messages_are_not_stored()
    {
        var h = new InputHistory();
        h.Add("   "); h.Add("hello"); h.Add("hello"); h.Add("  hello  ");
        Assert.Single(h.Items);
        Assert.Null(new InputHistory().Prev(""));
    }

    [Fact]
    public void History_survives_a_restart_and_is_capped()
    {
        var file = Path.Combine(Path.GetTempPath(), "aang-hist-" + Guid.NewGuid() + ".json");
        var a = new InputHistory(file);
        for (int i = 0; i < 70; i++) a.Add("message " + i);
        var b = new InputHistory(file);
        Assert.Equal(50, b.Items.Count);
        Assert.Equal("message 69", b.Prev(""));
        File.Delete(file);
    }

    [Fact]
    public void A_corrupt_history_file_is_ignored_not_fatal()
    {
        var file = Path.Combine(Path.GetTempPath(), "aang-hist-" + Guid.NewGuid() + ".json");
        File.WriteAllText(file, "{ not json");
        Assert.Empty(new InputHistory(file).Items);
        File.Delete(file);
    }
}
