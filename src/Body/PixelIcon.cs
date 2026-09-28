using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The pixel-icon language PetWindow.cs already used for its docked markers (a WoW quest mark, Stardew's bubble
/// over a head, an N64 HUD icon - Joshua named the tradition, 2026-09-22): one art pixel = a small square, O
/// outline, H catch-light, F face, S shade, . clear. Pulled out here, 2026-09-24, so BubbleView's list rows can
/// draw the same icon language instead of inventing a second one - a "kind of thing" icon should look the same
/// whether it is a docked marker or a row in the bubble.
/// </summary>
static class PixelIcon
{
    /// <summary>Draws one glyph centred at <paramref name="center"/>, <paramref name="px"/> device pixels per
    /// art pixel, tinted <paramref name="c"/> with the same hard-shadow-then-fill two-pass PetWindow.cs used.</summary>
    public static void Draw(Graphics g, string[] map, PointF center, Color c, float px, float scaleBy = 1f)
    {
        int w = map[0].Length, h = map.Length;
        var saved = g.Save();
        g.TranslateTransform(center.X, center.Y); g.ScaleTransform(scaleBy, scaleBy);
        g.SmoothingMode = SmoothingMode.None;
        float x0 = -w * px / 2f, y0 = -h * px / 2f;
        using var shadow = new SolidBrush(Color.FromArgb(120, 0, 0, 0));
        using var ol = new SolidBrush(Theme.Ink);
        using var hi = new SolidBrush(Mix(c, Color.White, 0.6f));
        using var face = new SolidBrush(c);
        using var sh = new SolidBrush(Mix(c, Color.Black, 0.38f));
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)            // a hard shadow, one art pixel down and right
            if (map[y][x] != '.') g.FillRectangle(shadow, x0 + (x + 1) * px, y0 + (y + 1) * px, px, px);
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
        {
            var b = map[y][x] switch { 'O' => ol, 'H' => hi, 'F' => face, 'S' => sh, _ => null };
            if (b != null) g.FillRectangle(b, x0 + x * px, y0 + y * px, px, px);
        }
        g.Restore(saved);
    }

    public static Color Mix(Color a, Color b, float t) =>
        Color.FromArgb(255, (int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));

    // One glyph per StructuredList.icon kind (protocol.ts's ListIcon) - the icon names what KIND of thing a row
    // is; the row's own chip colour says how it is doing. Never the reverse. First pass, built by reasoning
    // about the grid rather than seeing it render (2026-09-24) - these want the same real-UI look this project
    // already gives everything else before they count as finished, the way the existing markers were tuned.

    public static readonly string[] Job =            // a briefcase: handle, lid, latch band
    {
        "...OOO...",
        ".OOOOOOO.",
        "OHFFFFFHO",
        "OFFFFFFFO",
        "OSFFFFFSO",
        ".OOOOOOO.",
    };

    public static readonly string[] Email =          // an envelope, flap converging to a centre point
    {
        ".OOOOOOO.",
        "OH.....HO",
        "O.H...H.O",
        "O..HFH..O",
        "OFFFFFFFO",
        ".OOOOOOO.",
    };

    public static readonly string[] Meeting =        // a calendar page: two binding rings, a dotted grid
    {
        ".O.....O.",
        "OOOOOOOOO",
        "OFFFFFFFO",
        "OFOFOFOFO",
        "OFFFFFFFO",
        "OOOOOOOOO",
    };

    public static readonly string[] File =           // a plain document
    {
        ".OOOOO..",
        "OHFFFHO.",
        "OFFFFFO.",
        "OFFFFFO.",
        "OFFFFFO.",
        "OOOOOOO.",
    };

    public static readonly string[] Deadline =       // a clock, one highlighted hand
    {
        "..OOO..",
        ".OFFFO.",
        "OFFHFFO",
        "OFFFHFO",
        "OFFFFFO",
        ".OFFFO.",
        "..OOO..",
    };

    public static readonly string[] Reminder =       // a bell, tapered dome, flared rim, a clapper
    {
        "..OOO..",
        ".OFFFO.",
        ".OFFFO.",
        "OFFFFFO",
        "OOOOOOO",
        "...O...",
    };

    public static readonly string[] Session =        // a command prompt: > and an underscore bar
    {
        "O........",
        "OF.......",
        "OFF......",
        "OF.......",
        "O........",
        "...OOOOO.",
    };

    public static readonly string[] Link =           // a globe: a ring with a meridian band
    {
        "..OOO..",
        ".O...O.",
        "OOFFFOO",
        "O.FFF.O",
        "OOFFFOO",
        ".O...O.",
        "..OOO..",
    };

    public static readonly string[] Memory =         // a closed book, seen from above, spine down the middle
    {
        ".OOOOOOO.",
        "OHFF.FFHO",
        "OFFF.FFFO",
        "OFFF.FFFO",
        "OSFF.FFSO",
        ".OOOOOOO.",
    };

    public static string[] For(string icon) => icon switch
    {
        "job" => Job, "email" => Email, "meeting" => Meeting, "file" => File, "deadline" => Deadline,
        "reminder" => Reminder, "session" => Session, "link" => Link, "memory" => Memory,
        _ => File,
    };
}
