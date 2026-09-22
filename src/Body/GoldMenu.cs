using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The right-click and tray menu (StyleLab 2026-09-22, second pass): deep carved wood, not parchment - Joshua
/// tried the parchment version live and found it harsh for this surface, and wanted something closer to a
/// Zelda inventory panel. Cream parchment now works the other way round, as light text on dark wood, so the
/// two surfaces still share one palette. Groups ("Window", "Aang", "Settings") get their own carved-plaque
/// look - a recessed panel and gold text, always on, not just on hover - so the hierarchy reads before anything
/// is clicked. A game menu is also closer to a list of short button labels than a paragraph, so every row here
/// is set in the pixel face, the way a menu reads in the games this was built from.
/// </summary>
sealed class GoldMenuRenderer : ToolStripProfessionalRenderer
{
    const int Corner = 12;
    /// <summary>Tag a ToolStripMenuItem "header" to give it the carved-plaque look (2026-09-22).</summary>
    public const string HeaderTag = "header";
    static bool IsHeader(ToolStripItem i) => i.Tag as string == HeaderTag;

    public GoldMenuRenderer() : base(new ProfessionalColorTable()) { RoundedEdges = false; }

    static GraphicsPath Round(Rectangle r, int radius)
    {
        var d = radius * 2; var p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
    {
        var g = e.Graphics; var w = Math.Max(1, e.ToolStrip.Width); var h = Math.Max(1, e.ToolStrip.Height);
        using (var pg = new LinearGradientBrush(new Rectangle(0, 0, w, h), Theme.Wood1, Theme.Wood2, 90f)) g.FillRectangle(pg, e.AffectedBounds);
        // Grain: a handful of fixed streaks, the same every time this menu opens - not per-frame noise.
        var rnd = new Random(7);
        using var grain = new Pen(Theme.WoodGrain, 1f);
        for (int i = 0; i < h / 5; i++)
        {
            var y = rnd.Next(h); var x0 = rnd.Next(w / 3); var wobble = rnd.Next(-6, 6);
            g.DrawLine(grain, x0, y, w - rnd.Next(w / 3), y + wobble);
        }
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = new Rectangle(1, 1, e.ToolStrip.Width - 3, e.ToolStrip.Height - 3);
        using var path = Round(r, Corner);
        using var halo = new Pen(Theme.Halo, Theme.HaloStroke) { LineJoin = LineJoin.Round }; g.DrawPath(halo, path);
        using var pen = new Pen(Theme.Gold, Theme.Stroke); g.DrawPath(pen, path);
    }

    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e) { /* no separate margin colour: the wood runs to the edge */ }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = new Rectangle(7, 1, e.Item.Width - 15, e.Item.Height - 3);
        if (e.Item.Enabled && (e.Item.Selected || e.Item.Pressed))
        {
            using var path = Round(r, 8);
            using var fill = new SolidBrush(Theme.Gold); g.FillPath(fill, path);
            using var lip = new Pen(Theme.GoldDeep, 2f); g.DrawArc(lip, r.X + 3, r.Bottom - 10, 16, 10, 90, 90);   // a hint of the button's lip
            return;
        }
        if (IsHeader(e.Item))
        {
            // A carved-in plaque, always visible: a recessed panel with a dark top edge and a faint gold rim,
            // so "Window" / "Aang" / "Settings" read as categories before you ever hover one.
            using var path = Round(r, 6);
            using (var fill = new SolidBrush(Theme.WoodPlaque)) g.FillPath(fill, path);
            using (var top = new Pen(Color.FromArgb(140, 0, 0, 0), 1.4f)) g.DrawLine(top, r.X + 6, r.Y + 1, r.Right - 6, r.Y + 1);
            using var rim = new Pen(Theme.WithAlpha(Theme.GoldDeep, 130), 1f); g.DrawPath(rim, path);
        }
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        var header = IsHeader(e.Item);
        // Cream on wood, gold for a header's own label (a category, not a leaf) - dark ink once the gold
        // selection pill is under it, same as everywhere else that pill appears.
        e.TextColor = !e.Item.Enabled ? Theme.WithAlpha(Theme.WoodCream, 130)
            : e.Item.Selected || e.Item.Pressed ? Theme.Ink
            : header ? Theme.Gold : Theme.WoodCream;
        // Pixel font here was a mistake (2026-09-22, Joshua: "so fucking hard to read") - a menu gets read
        // fast and has no room for a chunky pixel grid the way a big button label does. Atkinson Hyperlegible,
        // the same body face as everywhere else you actually read text; bold and a touch larger marks a header.
        e.TextFont = Theme.Font(Theme.Face, header ? 15f : 13f, header ? FontStyle.Bold : FontStyle.Regular);
        // ClearType made this read thin (2026-09-22, Joshua: "hard to read"); AntiAliasGridFit is what the
        // bubble's reply text already uses and reads well, so match it here rather than the technically
        // "sharper" ClearType, which needs pixel-perfect LCD alignment this menu is not guaranteed to get.
        e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        using var dark = new Pen(Color.FromArgb(160, 0, 0, 0), 1.4f);
        using var light = new Pen(Theme.WithAlpha(Theme.Wood1, 200), 1f);
        var y = e.Item.Height / 2; var g = e.Graphics;
        g.DrawLine(dark, 16, y, e.Item.Width - 16, y);
        g.DrawLine(light, 16, y + 1, e.Item.Width - 16, y + 1);
    }

    protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        var c = e.Item.Selected ? Theme.Ink : Theme.Gold;
        using var b = new SolidBrush(c);
        var cy = e.Item.Height / 2;
        g.FillEllipse(b, 14, cy - 4, 8, 8);
    }

    protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
    {
        e.ArrowColor = e.Item.Selected ? Theme.Ink : Theme.Gold;
        base.OnRenderArrow(e);
    }
}

static class GoldMenu
{
    /// <summary>Mark a submenu item as a group header ("Window", "Aang", "Settings"): a carved-plaque look,
    /// always on, instead of a plain row that only lights up on hover.</summary>
    public static ToolStripMenuItem Header(string text)
    {
        var item = new ToolStripMenuItem(text) { Tag = GoldMenuRenderer.HeaderTag };
        return item;
    }

    /// <summary>Dress a menu and every submenu under it.</summary>
    public static void Apply(ToolStripDropDownMenu menu)
    {
        menu.Renderer = new GoldMenuRenderer();
        menu.BackColor = Theme.Wood2; menu.ForeColor = Theme.WoodCream;
        // Matches the regular-row font OnRenderItemText actually draws, so AutoSize measures the right thing
        // and nothing clips - a header row asks for extra width itself (see the loop below).
        menu.Font = Theme.Font(Theme.Face, 13f);
        menu.ShowImageMargin = false; menu.ShowCheckMargin = true;
        menu.Padding = new Padding(0, 8, 0, 8);
        menu.Opened += (_, _) =>
        {
            using var path = new GraphicsPath();
            var d = 24; var r = new Rectangle(0, 0, menu.Width, menu.Height);
            path.AddArc(r.X, r.Y, d, d, 180, 90); path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); path.AddArc(r.X, r.Bottom - d, d, d, 90, 90); path.CloseFigure();
            menu.Region = new Region(path);
        };
        foreach (ToolStripItem item in menu.Items)
        {
            if (item is ToolStripSeparator) continue;
            item.Padding = new Padding(10, 7, 14, 7);
            item.AutoSize = true;
            if (item.Tag as string == GoldMenuRenderer.HeaderTag) item.Font = Theme.Font(Theme.Face, 15f, FontStyle.Bold);   // so AutoSize measures the bigger header font too
            if (item is ToolStripMenuItem mi && mi.DropDown is ToolStripDropDownMenu sub) Apply(sub);
        }
    }
}
