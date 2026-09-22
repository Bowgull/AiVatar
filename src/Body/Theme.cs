using System.Drawing;
using System.Drawing.Text;

namespace Aang.Body;

/// <summary>
/// Clean Gold: the one set of colours, sizes and motion the whole Body draws from (docs/ROADMAP.md, Phase B).
/// Before this the bubble was gold while the input box and the chip under it were still cyan, and each surface kept
/// its own copy of every colour. A colour here means one thing everywhere:
///   Gold   = Aang: his outline, his voice, the main thing to press.
///   Orange = careful.   Red = no, or over.   Green = yes, or good.   Plum = the quiet alternative.
/// The sprite is never touched by any of this: only what surrounds him.
/// </summary>
static class Theme
{
    // ---- colour
    public static readonly Color Ink = Color.FromArgb(16, 10, 34);                    // #100A22 every surface
    public static readonly Color InkFill = Color.FromArgb(244, 16, 10, 34);           // the bubble, a hair see-through
    public static readonly Color Gold = Color.FromArgb(255, 255, 196, 60);            // #FFC43C
    public static readonly Color GoldDeep = Color.FromArgb(255, 201, 140, 20);        // the lip under a gold button
    public static readonly Color GoldLight = Color.FromArgb(255, 255, 226, 140);      // the catch-light on its top edge
    public static readonly Color Orange = Color.FromArgb(255, 255, 128, 64);          // #FF8040 careful
    public static readonly Color OrangeDeep = Color.FromArgb(255, 201, 94, 40);       // the lip under an orange button (the always-allow choice)
    public static readonly Color Red = Color.FromArgb(255, 255, 90, 74);              // #FF5A4A
    public static readonly Color Green = Color.FromArgb(255, 120, 230, 150);          // yes, good
    public static readonly Color Text = Color.FromArgb(255, 232, 228, 240);           // #E8E4F0 body text
    public static readonly Color Secondary = Color.FromArgb(255, 201, 194, 218);      // #C9C2DA
    public static readonly Color Plum = Color.FromArgb(255, 74, 44, 110);             // the quiet button's face
    public static readonly Color PlumDeep = Color.FromArgb(255, 44, 24, 72);          // its lip
    public static readonly Color PlumEdge = Color.FromArgb(255, 150, 110, 200);       // its outline, and the scrollbar thumb
    public static readonly Color Claude = Color.FromArgb(255, 0xE8, 0x8A, 0x6A);      // Claude's terracotta, for anything that is Claude
    public static readonly Color Panel2 = Color.FromArgb(255, 26, 17, 50);            // the Panel's lists and text areas, a step lighter than the ink
    public static readonly Color Halo = Color.FromArgb(120, 0, 0, 0);                 // under the outline, so it holds on bright ground
    public static readonly Color AvatarGlow = Color.FromArgb(255, 200, 232, 255);     // Avatar State: something truly blocking. Means only this, nowhere else.

    // ---- the parchment reading pane (StyleLab 2026-09-22): the ink+gold frame is kept exactly; the surface the
    // text actually sits on, inset inside it, is warm parchment - Stardew/WoW/OoT dialogue convention, and what
    // the APCA contrast pass called for over pale text on ink. Text and dim text switch to dark ink to read on it.
    public static readonly Color Parch1 = Color.FromArgb(255, 236, 213, 168), Parch2 = Color.FromArgb(255, 222, 194, 140);
    public static readonly Color ParchEdge = Color.FromArgb(130, 92, 61, 33);
    public static readonly Color InkText = Color.FromArgb(255, 46, 34, 22);           // body text on parchment
    public static readonly Color InkDim = Color.FromArgb(255, 90, 72, 52);            // dim/secondary text on parchment

    // ---- deep wood (the menu, StyleLab 2026-09-22): carved wood and stone, not parchment - Joshua found the
    // parchment menu "harsh and ugly" for this surface. Cream parchment now works the other way round, as
    // light text on a dark wood panel, tying the two surfaces to the same palette from opposite directions.
    public static readonly Color Wood1 = Color.FromArgb(255, 74, 46, 26);             // lighter wood, top of the gradient
    public static readonly Color Wood2 = Color.FromArgb(255, 36, 22, 13);             // deep walnut, bottom of the gradient
    public static readonly Color WoodGrain = Color.FromArgb(40, 0, 0, 0);             // streaks, always the same seed
    public static readonly Color WoodPlaque = Color.FromArgb(255, 26, 15, 9);         // recessed panel behind a header row
    public static readonly Color WoodCream = Color.FromArgb(255, 236, 213, 168);      // = Parch1: menu text on wood

    // ---- modes: one gold outer frame for everything, and an inner stroke that says which brain is answering.
    public static readonly Color ModeQuick = Color.FromArgb(255, 0, 209, 255);        // #00D1FF
    public static readonly Color ModeSmart = Color.FromArgb(255, 61, 155, 255);       // #3D9BFF
    public static readonly Color ModeDeep = Color.FromArgb(255, 169, 112, 255);       // #A970FF, with a gold ornament
    public static readonly Color ModeSaving = Color.FromArgb(255, 142, 135, 158);     // #8E879E
    /// <summary>The colour of a mode. Auto is plain gold: it is the default, so it carries no extra mark.</summary>
    public static Color ModeColor(string mode, bool saving) => saving ? ModeSaving : mode switch
    {
        "quick" => ModeQuick, "smart" => ModeSmart, "deep" => ModeDeep, _ => Gold,
    };

    public static Color WithAlpha(Color c, int a) => Color.FromArgb(a, c.R, c.G, c.B);

    // ---- type (pixels: the surface is already DPI-scaled, see BubbleView)
    public const float BodyPx = 15f, StripPx = 12f, ButtonPx = 8f, ReceiptPx = 12.5f;
    /// <summary>Body and every sentence: legibility research (APCA contrast, low-vision testing) picked this
    /// over Bahnschrift, which was never meant to run this small. Ships as a TTF (assets/aang/fonts), not
    /// a Windows font, so it is loaded into a private collection below rather than looked up by name.</summary>
    public const string Face = "Atkinson Hyperlegible", FaceBold = "Atkinson Hyperlegible";
    /// <summary>Short UI accents only - button labels, the mode chip, the speaker name. Never a sentence: it is
    /// far too slow to read in bulk. Also a private TTF; see Font() below.</summary>
    public const string PixelFace = "Press Start 2P";

    static readonly PrivateFontCollection Fonts = new();
    static readonly FontFamily? AtkinsonFamily, PressStartFamily;
    static Theme()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "assets", "aang", "fonts");
        if (Directory.Exists(dir))
        {
            foreach (var f in Directory.GetFiles(dir, "*.ttf")) { try { Fonts.AddFontFile(f); } catch (Exception e) { Log.Write("font load failed: " + f + ": " + e.Message); } }
            AtkinsonFamily = Fonts.Families.FirstOrDefault(fam => fam.Name.Contains("Atkinson", StringComparison.OrdinalIgnoreCase));
            PressStartFamily = Fonts.Families.FirstOrDefault(fam => fam.Name.Contains("Press Start", StringComparison.OrdinalIgnoreCase));
        }
    }
    /// <summary>A font by the names above, resolved against the private collection when it is one of ours,
    /// or a normal system font otherwise (Cascadia Mono and the like, still used here and there).</summary>
    public static Font Font(string face, float px, FontStyle style = FontStyle.Regular) => face switch
    {
        Face when AtkinsonFamily != null => new Font(AtkinsonFamily, px, style, GraphicsUnit.Pixel),
        PixelFace when PressStartFamily != null => new Font(PressStartFamily, px, FontStyle.Regular, GraphicsUnit.Pixel),
        _ => new Font(face, px, style, GraphicsUnit.Pixel),
    };

    // ---- shape
    public const int Radius = 12;                 // the bubble; the input box and buttons are rounder
    public const float Stroke = 2.0f;             // anything Aang owns; a hairline would look like system chrome
    public const float HaloStroke = 4.2f;         // drawn first, under the stroke
    public const int Lip = 3;                     // the weight under a button

    // ---- motion (ms). One ease-out everywhere; nothing bounces.
    public const int PressMs = 40, HoverMs = 140, ReleaseMs = 200;
}
