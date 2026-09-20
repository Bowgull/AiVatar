using Aang.Body;
using Xunit;

namespace Body.Tests;

public class ModelChipTests
{
    [Fact] public void Cycle_visits_all_four_and_returns() =>
        Assert.Equal(new[] { "quick", "smart", "deep", "auto" }, new[] { "auto", "quick", "smart", "deep" }.Select(ModelChip.Next));

    [Theory] [InlineData("SMART", "smart")] [InlineData(" deep ", "deep")] [InlineData("sonnet", "auto")] [InlineData(null, "auto")]
    public void Normalize_is_forgiving(string? input, string expected) => Assert.Equal(expected, ModelChip.Normalize(input));

    [Theory] [InlineData(1, "auto")] [InlineData(2, "quick")] [InlineData(3, "smart")] [InlineData(4, "deep")] [InlineData(9, "auto")]
    public void Digits_map_to_modes(int d, string expected) => Assert.Equal(expected, ModelChip.FromDigit(d));

    [Theory] [InlineData(0.39, false, "ok")] [InlineData(0.40, false, "warn")] [InlineData(0.50, false, "offer")] [InlineData(0.9, true, "saving")]
    public void Level_follows_the_40_and_50_percent_rule(double week, bool saving, string expected) => Assert.Equal(expected, ModelChip.LevelFor(week, saving));

    [Fact] public void Percent_rounds_and_clamps() { Assert.Equal("34%", ModelChip.Percent(0.344)); Assert.Equal("100%", ModelChip.Percent(1.7)); Assert.Equal("0%", ModelChip.Percent(-1)); }
}
