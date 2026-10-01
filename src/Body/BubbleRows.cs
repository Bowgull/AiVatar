namespace Aang.Body;

/// <summary>One row in a bubble's present_list (protocol.ts's StructuredItem): what it is (Title/Subtitle) and,
/// if it has one, how it is doing (Chip*). Icon lives on the parent BubbleRows, not here - a list is one kind
/// of thing, never mixed (2026-09-24).</summary>
sealed class BubbleRow
{
    public string Title = "";
    public string? Subtitle;
    public string? ChipText;
    /// <summary>good/normal/careful/stop/inactive - Theme.cs's own five-way vocabulary, not a new one.</summary>
    public string? ChipTone;
}

/// <summary>protocol.ts's StructuredList, on the Body side: the payload a bubble message's own "list" field
/// carries when the model called present_list this turn.</summary>
sealed class BubbleRows
{
    public string Icon = "";
    public List<BubbleRow> Items = new();
    public int? MoreCount;
    /// <summary>The carved header plaque (mockup D), or null. Rare by design: board E's rule is that it
    /// "only appears when something is genuinely urgent, its colour saying which tier", and present_list's
    /// own schema says the same to the model. A plaque on every list is a banner nobody reads.</summary>
    public string? HeaderText;
    public string? HeaderTone;
}
