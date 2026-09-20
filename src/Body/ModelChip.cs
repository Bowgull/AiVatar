namespace Aang.Body;

/// <summary>The model chip's choices and the quota wording. Pure logic, so it is unit tested.</summary>
static class ModelChip
{
    public static readonly string[] Modes = { "auto", "quick", "smart", "deep" };

    public static string Normalize(string? mode)
    {
        var m = (mode ?? "").Trim().ToLowerInvariant();
        return Array.IndexOf(Modes, m) >= 0 ? m : "auto";
    }

    public static string Next(string mode) => Modes[(Array.IndexOf(Modes, Normalize(mode)) + 1) % Modes.Length];

    public static string Label(string mode) => Normalize(mode) switch
    {
        "quick" => "Quick", "smart" => "Smart", "deep" => "Deep", _ => "Auto",
    };

    /// <summary>What each choice means, for the tray menu and tooltips.</summary>
    public static string Describe(string mode) => Normalize(mode) switch
    {
        "quick" => "Quick (Haiku): fastest, for chat",
        "smart" => "Smart (Sonnet): better reasoning",
        "deep" => "Deep (Opus): the strongest, slowest",
        _ => "Auto: Quick for chat, Smart when the work needs it",
    };

    /// <summary>1..4 on the keyboard: Ctrl+1 Auto, Ctrl+2 Quick, Ctrl+3 Smart, Ctrl+4 Deep.</summary>
    public static string FromDigit(int digit) => digit is >= 1 and <= 4 ? Modes[digit - 1] : "auto";

    public static string Percent(double v) => $"{Math.Round(Math.Clamp(v, 0, 1) * 100)}%";

    /// <summary>Warn from 40% of the week, offer to save from 50% (Joshua's rule; the Core decides, the Body only colours).</summary>
    public static string LevelFor(double week, bool saving) => saving ? "saving" : week >= 0.5 ? "offer" : week >= 0.4 ? "warn" : "ok";
}
