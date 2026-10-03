using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace Aang.Body;

/// <summary>
/// The lipped keycap button, as a control, so surfaces other than the bubble can use it.
/// </summary>
/// <remarks>
/// Joshua, 2026-10-03: "I LOVE the weight of the buttons currently they feel and look great lets keep
/// this in mind." They only existed inside BubbleView's own painting, so the Panel used plain WinForms
/// buttons and looked like a different program. This is the same recipe, lifted exactly rather than
/// re-eyeballed: a lip rectangle behind, the face sitting Theme.Lip higher on top of it, one light line
/// across the top of the face, and the pixel typeface - short words only, which is what it is good at.
///
/// It also carries the key that works it, drawn small in the corner, because the stack is meant to be
/// triaged from the keyboard and a shortcut nobody can see is a shortcut nobody uses.
/// </remarks>
sealed class Keycap : Control
{
    public Keycap()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Cursor = Cursors.Hand;
        TabStop = false;
    }

    /// <summary>The face colour. The lip and edge are derived from it so a caller cannot get them out of step.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Color Face { get; set; } = Theme.Gold;
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Color Lip { get; set; } = Theme.GoldDeep;
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Color Edge { get; set; } = Theme.GoldLight;
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Color Ink { get; set; } = Theme.Ink;
    /// <summary>Gold-filled, like the bubble's verb button: one per row at most, for the thing he usually wants.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public bool Primary { get; set; } = true;
    /// <summary>The single key that does this, drawn in the corner. Empty for a button with no shortcut.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public string Key { get; set; } = "";

    bool down;

    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if (e.Button == MouseButtons.Left) { down = true; Invalidate(); } }
    protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); if (down) { down = false; Invalidate(); } }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); if (down) { down = false; Invalidate(); } }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
        using var f = Theme.Font(Theme.PixelFace, Theme.ButtonPx);

        // Pressed: the face drops onto the lip, which is the whole reason the lip is there.
        var lipH = down ? 0 : Theme.Lip;
        var r = new RectangleF(0, down ? Theme.Lip : 0, Width - 1, Height - 1 - (down ? Theme.Lip : 0));
        var face = new RectangleF(r.X, r.Y, r.Width, r.Height - lipH);

        if (!down) using (var p = RoundRect(r, 9)) using (var b = new SolidBrush(Lip)) g.FillPath(b, p);
        using (var p = RoundRect(face, 9))
        {
            using (var b = new SolidBrush(Enabled ? Face : Theme.WithAlpha(Face, 90))) g.FillPath(b, p);
            if (!Primary) using (var pen = new Pen(Edge, 1.2f)) g.DrawPath(pen, p);
        }
        using (var light = new Pen(Theme.WithAlpha(Primary ? Theme.GoldLight : Edge, 170), 1f))
            g.DrawLine(light, face.X + 9, face.Y + 1.5f, face.Right - 9, face.Y + 1.5f);

        using var tb = new SolidBrush(Enabled ? Ink : Theme.WithAlpha(Ink, 120));
        var sz = g.MeasureString(Text, f, PointF.Empty, StringFormat.GenericTypographic);
        g.DrawString(Text, f, tb, face.X + (face.Width - sz.Width) / 2, face.Y + (face.Height - sz.Height) / 2, StringFormat.GenericTypographic);

        if (Key.Length > 0)
        {
            // Bright enough to actually read. The first version used alpha 130, which on a plum face was
            // invisible at normal size - a shortcut nobody can see is a shortcut nobody uses, which was the
            // whole reason for drawing it (seen in the capture, 2026-10-03). Inset past the corner radius.
            using var kf = Theme.Font(Theme.PixelFace, Theme.ButtonPx - 2f);
            using var kb = new SolidBrush(Theme.WithAlpha(Ink, 205));
            g.DrawString(Key, kf, kb, face.Right - 15, face.Y + 5, StringFormat.GenericTypographic);
        }
    }

    static GraphicsPath RoundRect(RectangleF r, float rad)
    {
        var p = new GraphicsPath();
        if (r.Width <= 0 || r.Height <= 0) return p;
        rad = Math.Min(rad, Math.Min(r.Width, r.Height) / 2);
        var d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}
