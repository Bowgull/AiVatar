using System.Runtime.InteropServices;

namespace Aang.Body;

/// <summary>The handful of Win32 calls the pet window needs. Kept in one place so the rest stays managed.</summary>
static class Win32
{
    public const int WS_EX_LAYERED = 0x80000, WS_EX_TOPMOST = 0x8, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000;
    public const int WM_ERASEBKGND = 0x0014, WM_PRINT = 0x0317, WM_PRINTCLIENT = 0x0318, WM_HOTKEY = 0x0312;
    public const uint MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_NOREPEAT = 0x4000;
    public const int SRCCOPY = 0x00CC0020;

    [StructLayout(LayoutKind.Sequential)]
    public struct BITMAPINFOHEADER
    {
        public uint biSize; public int biWidth, biHeight; public ushort biPlanes, biBitCount;
        public uint biCompression, biSizeImage; public int biXPels, biYPels; public uint biClrUsed, biClrImportant;
    }
    [StructLayout(LayoutKind.Sequential)] public struct BITMAPINFO { public BITMAPINFOHEADER h; public uint colors; }
    [StructLayout(LayoutKind.Sequential)] public struct BLENDFUNCTION { public byte Op, Flags, Alpha, Format; }
    [StructLayout(LayoutKind.Sequential)] public struct PT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct SZ { public int cx, cy; }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dst, ref PT pptDst, ref SZ size, IntPtr src, ref PT pptSrc, uint key, ref BLENDFUNCTION blend, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    // The native clipboard. .NET's Clipboard class threw on this machine although the text had landed, and could not
    // read back its own write; these calls are what it wraps, without the flush step that failed.
    [DllImport("user32.dll", SetLastError = true)] static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseClipboard();
    [DllImport("user32.dll", SetLastError = true)] static extern bool EmptyClipboard();
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetClipboardData(uint format, IntPtr mem);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GlobalLock(IntPtr mem);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GlobalUnlock(IntPtr mem);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GlobalFree(IntPtr mem);

    /// <summary>Replace the clipboard with this text (Unicode). Retries while another program has it open. Null on success, else why not.</summary>
    public static string? SetClipboardText(string text, IntPtr owner)
    {
        const uint CF_UNICODETEXT = 13, GMEM_MOVEABLE = 0x2;
        bool open = false;
        for (int i = 0; i < 20 && !open; i++) { open = OpenClipboard(owner); if (!open) System.Threading.Thread.Sleep(25); }
        if (!open) return "another program is holding the clipboard open";
        try
        {
            EmptyClipboard();
            var bytes = (text.Length + 1) * 2;
            var mem = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)bytes);
            if (mem == IntPtr.Zero) return "Windows had no memory to give it";
            var p = GlobalLock(mem);
            if (p == IntPtr.Zero) { GlobalFree(mem); return "the clipboard memory could not be locked"; }
            try { Marshal.Copy(text.ToCharArray(), 0, p, text.Length); Marshal.WriteInt16(p, text.Length * 2, 0); } finally { GlobalUnlock(mem); }
            if (SetClipboardData(CF_UNICODETEXT, mem) == IntPtr.Zero) { GlobalFree(mem); return "Windows would not take the text"; }   // on success the system owns mem
            return null;
        }
        finally { CloseClipboard(); }
    }

    [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize, dwTime; }
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    /// <summary>How long since the last key press or mouse move anywhere on this PC.</summary>
    public static TimeSpan IdleFor()
    {
        var li = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref li)) return TimeSpan.Zero;
        return TimeSpan.FromMilliseconds(unchecked((uint)Environment.TickCount - li.dwTime));
    }
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h, int id);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool QueryFullProcessImageName(IntPtr process, uint flags, System.Text.StringBuilder name, ref uint size);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    public const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

    /// <summary>
    /// Windows only lets the foreground process hand focus over. Joining the foreground thread's input queue for
    /// the moment of the call is the standard way to take (and later give back) focus reliably, for example from
    /// a game to the input box and back again.
    /// </summary>
    public static void ForceForeground(IntPtr target)
    {
        if (target == IntPtr.Zero) return;
        var fg = GetForegroundWindow();
        var fgThread = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out _);
        var me = GetCurrentThreadId();
        var attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
        try { BringWindowToTop(target); SetForegroundWindow(target); }
        finally { if (attached) AttachThreadInput(me, fgThread, false); }
    }

    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFO bi, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int rop);
}

