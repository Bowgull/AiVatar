// THROWAWAY measurement spike: custom per-pixel-alpha layered window, CPU-rendered into a shared
// DIB and pushed with UpdateLayeredWindow - the same technique Rainmeter uses, but event-driven
// and without its shared main thread. No GPU involved, so WoW's GPU load cannot stall it.
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main() { ApplicationConfiguration.Initialize(); Application.Run(new PetForm()); }
}

sealed class PetForm : Form
{
    const int W = 470, H = 310;

    [StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER { public uint biSize; public int biWidth, biHeight; public ushort biPlanes, biBitCount; public uint biCompression, biSizeImage; public int biXPels, biYPels; public uint biClrUsed, biClrImportant; }
    [StructLayout(LayoutKind.Sequential)] struct BITMAPINFO { public BITMAPINFOHEADER h; public uint colors; }
    [StructLayout(LayoutKind.Sequential)] struct BLENDFUNCTION { public byte Op, Flags, Alpha, Format; }
    [StructLayout(LayoutKind.Sequential)] struct PT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct SZ { public int cx, cy; }
    [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dst, ref PT pptDst, ref SZ size, IntPtr src, ref PT pptSrc, uint key, ref BLENDFUNCTION blend, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFO bi, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);

    IntPtr memDc, dib;
    Bitmap surf = null!;
    Graphics g = null!;
    int t;
    readonly System.Windows.Forms.Timer timer = new();
    readonly Font font = new("Segoe UI", 10f);

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= 0x80000 | 0x8 | 0x80 | 0x08000000; return cp; } // layered|topmost|toolwindow|noactivate
    }
    protected override bool ShowWithoutActivation => true;

    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int rop);

    // PrintWindow (used by screenshot tools) asks the window to paint itself with WM_PRINT.
    // A layered window fed through UpdateLayeredWindow never paints, so without this it captures as
    // the form's default gray. Answer with the same pixels we push to the screen.
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x0317 || m.Msg == 0x0318) { BitBlt(m.WParam, 0, 0, W, H, memDc, 0, 0, 0x00CC0020); return; }
        if (m.Msg == 0x0014) { m.Result = (IntPtr)1; return; }
        base.WndProc(ref m);
    }

    public PetForm()
    {
        Text = "AangSpike"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual;
        Location = new Point(1430, 740); Size = new Size(W, H); ShowInTaskbar = false; TopMost = true;

        var screen = GetDC(IntPtr.Zero);
        memDc = CreateCompatibleDC(screen);
        var bi = new BITMAPINFO { h = new BITMAPINFOHEADER { biSize = (uint)Marshal.SizeOf<BITMAPINFOHEADER>(), biWidth = W, biHeight = -H, biPlanes = 1, biBitCount = 32 } };
        dib = CreateDIBSection(screen, ref bi, 0, out var bits, IntPtr.Zero, 0);
        SelectObject(memDc, dib);
        ReleaseDC(IntPtr.Zero, screen);
        surf = new Bitmap(W, H, W * 4, PixelFormat.Format32bppPArgb, bits);
        g = Graphics.FromImage(surf);
        g.SmoothingMode = SmoothingMode.None;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;

        int fps = int.TryParse(Environment.GetEnvironmentVariable("SPIKE_FPS"), out var f) ? f : 30;
        timer.Interval = Math.Max(1, 1000 / fps);
        timer.Tick += (_, _) => { t++; Draw(); };
    }

    protected override void OnShown(EventArgs e) { base.OnShown(e); Draw(); timer.Start(); }

    void Draw()
    {
        g.Clear(Color.Transparent);
        using (var bg = new SolidBrush(Color.FromArgb(240, 13, 10, 30))) g.FillRectangle(bg, 5, 5, 257, 120);
        using (var pen = new Pen(Color.FromArgb(0xe8, 0xa3, 0x3a), 2)) g.DrawRectangle(pen, 5, 5, 257, 120);
        g.DrawString("spike bubble " + (t % 100), font, Brushes.White, 20, 20);
        int bob = (int)Math.Round(Math.Sin(t / 8.0) * 3);
        using (var b = new SolidBrush(Color.FromArgb(0xe9, 0xc9, 0xa8))) g.FillRectangle(b, 338, 160 + bob, 44, 44);
        using (var b = new SolidBrush(Color.FromArgb(0xe8, 0xb9, 0x3a))) g.FillRectangle(b, 330, 204 + bob, 60, 66);
        using (var b = new SolidBrush(Color.FromArgb(0x7a, 0x4b, 0x9a))) g.FillRectangle(b, 326, 272, 68, 10);

        var dst = new PT { x = Left, y = Top }; var size = new SZ { cx = W, cy = H }; var src = new PT();
        var bf = new BLENDFUNCTION { Op = 0, Flags = 0, Alpha = 255, Format = 1 };
        UpdateLayeredWindow(Handle, IntPtr.Zero, ref dst, ref size, memDc, ref src, 0, ref bf, 2);
    }
}
