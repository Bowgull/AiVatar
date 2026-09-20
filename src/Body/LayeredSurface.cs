using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Aang.Body;

/// <summary>
/// A premultiplied-alpha bitmap shared with a GDI DIB section. Drawing happens on the CPU with GDI+, then
/// <see cref="Present"/> hands the same memory to Windows. No GPU is involved, so a game saturating the
/// GPU cannot stall the pet, and Windows treats fully transparent pixels as click-through by itself.
/// </summary>
sealed class LayeredSurface : IDisposable
{
    public int Width { get; }
    public int Height { get; }
    public IntPtr Dc { get; private set; }
    public Graphics G { get; }
    readonly IntPtr dib;
    readonly Bitmap bmp;

    public LayeredSurface(int width, int height)
    {
        Width = width; Height = height;
        var screen = Win32.GetDC(IntPtr.Zero);
        Dc = Win32.CreateCompatibleDC(screen);
        var bi = new Win32.BITMAPINFO
        {
            h = new Win32.BITMAPINFOHEADER
            {
                biSize = (uint)Marshal.SizeOf<Win32.BITMAPINFOHEADER>(),
                biWidth = width, biHeight = -height, biPlanes = 1, biBitCount = 32,
            },
        };
        dib = Win32.CreateDIBSection(screen, ref bi, 0, out var bits, IntPtr.Zero, 0);
        Win32.SelectObject(Dc, dib);
        Win32.ReleaseDC(IntPtr.Zero, screen);
        bmp = new Bitmap(width, height, width * 4, PixelFormat.Format32bppPArgb, bits);
        G = Graphics.FromImage(bmp);
        G.CompositingMode = CompositingMode.SourceOver;
        G.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
    }

    public void Clear() => G.Clear(Color.Transparent);

    public bool Present(IntPtr hwnd, Point pos)
    {
        var dst = new Win32.PT { x = pos.X, y = pos.Y };
        var size = new Win32.SZ { cx = Width, cy = Height };
        var src = new Win32.PT();
        var blend = new Win32.BLENDFUNCTION { Op = 0, Flags = 0, Alpha = 255, Format = 1 };
        return Win32.UpdateLayeredWindow(hwnd, IntPtr.Zero, ref dst, ref size, Dc, ref src, 0, ref blend, 2);
    }

    public void Dispose()
    {
        G.Dispose(); bmp.Dispose();
        Win32.DeleteDC(Dc); Win32.DeleteObject(dib);
    }
}
