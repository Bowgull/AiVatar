using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The right-click and tray menu in Clean Gold: the same ink, gold and plum as the bubble, in place of the grey Windows
/// menu. Ink panel, a 2 px gold outline with rounded corners, roomy rows in Bahnschrift, a gold pill under the row the
/// mouse is on (with ink text, like a gold button), and a gold dot for anything switched on.
/// </summary>
sealed class GoldMenuRenderer : ToolStripProfessionalRenderer
{
    const int Corner = 12;

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
        using var b = new SolidBrush(Theme.Ink); e.Graphics.FillRectangle(b, e.AffectedBounds);
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = new Rectangle(1, 1, e.ToolStrip.Width - 3, e.ToolStrip.Height - 3);
        using var path = Round(r, Corner);
        using var pen = new Pen(Theme.Gold, Theme.Stroke); g.DrawPath(pen, path);
    }

    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e) { /* no separate margin colour: the ink runs to the edge */ }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Enabled || !(e.Item.Selected || e.Item.Pressed)) return;
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        var r = new Rectangle(7, 1, e.Item.Width - 15, e.Item.Height - 3);
        using var path = Round(r, 8);
        using var fill = new SolidBrush(Theme.Gold); g.FillPath(fill, path);
        using var lip = new Pen(Theme.GoldDeep, 2f); g.DrawArc(lip, r.X + 3, r.Bottom - 10, 16, 10, 90, 90);   // a hint of the button's lip
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = !e.Item.Enabled ? Theme.WithAlpha(Theme.Secondary, 150) : e.Item.Selected || e.Item.Pressed ? Theme.Ink : Theme.Text;
        e.TextFont = new Font(Theme.FaceBold, 10.5f, FontStyle.Regular, GraphicsUnit.Point);
        base.OnRenderItemText(e);
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        using var pen = new Pen(Theme.Plum, 1.5f);
        var y = e.Item.Height / 2; e.Graphics.DrawLine(pen, 16, y, e.Item.Width - 16, y);
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
    /// <summary>Dress a menu and every submenu under it.</summary>
    public static void Apply(ToolStripDropDownMenu menu)
    {
        menu.Renderer = new GoldMenuRenderer();
        menu.BackColor = Theme.Ink; menu.ForeColor = Theme.Text;
        menu.Font = new Font(Theme.FaceBold, 10.5f, FontStyle.Regular, GraphicsUnit.Point);
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
            if (item is ToolStripMenuItem mi && mi.DropDown is ToolStripDropDownMenu sub) Apply(sub);
        }
    }
}
