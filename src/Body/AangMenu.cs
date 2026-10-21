namespace Aang.Body;

/// <summary>
/// Sheet 56, look A (2026-10-21): Aang's new right-click menu, drawn by the Shell in Samara's wood. The Shell only draws
/// it; every pick comes back here as an id (`menu.pick`) and runs the same pet handler the old gold menu item ran, so
/// there is one place each thing is done. Pure mapping, so the tests can check every id lands on the right handler.
/// "Look back" never comes here: the Shell opens the scroll-back in its own bubble.
/// </summary>
static class AangMenu
{
    /// <summary>The pet's handlers, one per thing the menu can do. PetWindow fills these with its existing methods.</summary>
    internal sealed class Host
    {
        public required Action ClaudeJobs { get; init; }
        public required Action JobHunt { get; init; }
        /// <summary>Minutes to hush for; 0 ends it.</summary>
        public required Action<int> Hush { get; init; }
        public required Action ToggleMute { get; init; }
        /// <summary>null = auto (quiet while WoW is in front), true = always, false = never.</summary>
        public required Action<bool?> Quiet { get; init; }
        public required Action<DockEdge> Dock { get; init; }
        public required Action ComeBack { get; init; }
        public required Action Hide { get; init; }
        public required Action<string> Model { get; init; }
        public required Action ToggleSaving { get; init; }
        public required Action Quit { get; init; }
    }

    /// <summary>Hush "until tomorrow" ends at this hour of the next morning.</summary>
    public const int MorningHour = 6;

    /// <summary>Minutes from now until tomorrow morning at <see cref="MorningHour"/>. Before that hour it is this morning.</summary>
    public static int MinutesUntilMorning(DateTime now)
    {
        var end = now.Date.AddHours(MorningHour);
        if (end <= now) end = end.AddDays(1);
        return Math.Max(1, (int)Math.Ceiling((end - now).TotalMinutes));
    }

    /// <summary>Runs the handler for one pick. False for an id it does not know (nothing runs).</summary>
    public static bool Run(string? id, Host h, DateTime now)
    {
        switch (id)
        {
            case "jobs": h.ClaudeJobs(); return true;
            case "hunt": h.JobHunt(); return true;
            case "hush.15": h.Hush(15); return true;
            case "hush.60": h.Hush(60); return true;
            case "hush.240": h.Hush(240); return true;
            case "hush.tomorrow": h.Hush(MinutesUntilMorning(now)); return true;
            case "hush.off": h.Hush(0); return true;
            case "mute": h.ToggleMute(); return true;
            case "quiet.auto": h.Quiet(null); return true;
            case "quiet.always": h.Quiet(true); return true;
            case "quiet.never": h.Quiet(false); return true;
            case "dock.bottom": h.Dock(DockEdge.Bottom); return true;
            case "dock.left": h.Dock(DockEdge.Left); return true;
            case "dock.right": h.Dock(DockEdge.Right); return true;
            case "dock.top": h.Dock(DockEdge.Top); return true;
            case "comeback": h.ComeBack(); return true;
            case "hide": h.Hide(); return true;
            case "saving": h.ToggleSaving(); return true;
            case "quit": h.Quit(); return true;
        }
        if (id != null && id.StartsWith("model.", StringComparison.Ordinal))
        {
            var m = id["model.".Length..];
            if (Array.IndexOf(ModelChip.Modes, m) < 0) return false;
            h.Model(m);
            return true;
        }
        return false;
    }

    /// <summary>The menu's quiet row for the pet's forcedQuiet.</summary>
    public static string QuietName(bool? forced) => forced switch { null => "auto", true => "always", false => "never" };

    /// <summary>The menu's dock row for the pet's edge ("none" when he is not docked).</summary>
    public static string DockName(DockEdge e) => e == DockEdge.None ? "none" : e.ToString().ToLowerInvariant();
}
