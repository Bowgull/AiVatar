// AangReader --botw-pos --out <pos.json> [--log <Cemu log.txt>] [--parent <pid>] [--every <ms>] [--give-up <ms>]
//
// BG8 (docs/BOTW-GUIDE.md, research: Aang/research_notes/BotW guide/live_position.md): where Link is right now, while
// Cemu runs. The brain starts this when Cemu is running and it stays until Cemu closes.
//
// Read-only, always:
//   - Cemu's log.txt is opened for reading, shared, to find this launch's guest memory base
//     ("Init Wii U memory space (base: 0x...)"). Nothing else of Cemu's is opened.
//   - Cemu itself is opened with PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION and read with ReadProcessMemory,
//     12 bytes once a second. No injection, no writes, no debugger port, no keys.
// Link's position (BotW v1.5.0 / v208) is three big-endian floats at base + 0x1055300C: x (east), height, z (south).
// The address was verified on the JP copy only; a wrong address fails safe: if no read in the first --give-up ms is a
// believable position, it removes pos.json, prints why and exits 3. The brain does not try again until Cemu restarts.
//
// pos.json (docs/BOTW-STATE.md): { v:1, at, x, y, z, facing, live } written whole (temp + rename). Facing comes from
// movement (degrees, 0 = north, 90 = east), kept while he stands still; -1 until he has moved. live:false when Cemu
// closes. One JSON line on stdout per event (start, fail, end) for the brain's log.
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;

namespace Aang.Reader;

static class BotwPos
{
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    const uint PROCESS_VM_READ = 0x0010, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    public const long POS_OFFSET = 0x1055300C;
    public const string DEFAULT_LOG = @"C:\Games\Cemu\portable\log.txt";
    static readonly Regex BaseRe = new(@"Init Wii U memory space \(base: 0x([0-9a-fA-F]+)\)", RegexOptions.Compiled);

    public static int Run(string[] args)
    {
        string? outFile = Str(args, "--out");
        if (outFile == null) { Say("fail", "no --out given"); return 2; }
        string logFile = Str(args, "--log") ?? DEFAULT_LOG;
        int every = (int)Num(args, "--every", 1000), giveUp = (int)Num(args, "--give-up", 120_000);

        var cemu = Process.GetProcessesByName("Cemu").OrderBy(p => SafeStart(p)).LastOrDefault();
        if (cemu == null) { MarkClosed(outFile); Say("end", "Cemu is not running"); return 0; }
        long? mem = BaseFromLog(logFile, SafeStart(cemu));
        if (mem == null) { Remove(outFile); Say("fail", "no memory base for this Cemu launch in its log"); return 3; }

        IntPtr h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, false, cemu.Id);
        if (h == IntPtr.Zero) { Remove(outFile); Say("fail", $"could not open Cemu to read (error {Marshal.GetLastWin32Error()})"); return 3; }
        Say("start", $"reading Cemu {cemu.Id} at base 0x{mem.Value:x}");
        try
        {
            var track = new Track();
            var buf = new byte[12];
            var clock = Stopwatch.StartNew();
            bool everValid = false;
            long lastWrite = -10_000;
            Process? parent = null;
            try { long pp = Num(args, "--parent", 0); if (pp > 0) parent = Process.GetProcessById((int)pp); } catch { }
            while (!cemu.HasExited)
            {
                // The brain that started this is gone (restart, update): leave, the next brain starts its own.
                if (parent != null && parent.HasExited) { Say("end", "the brain left"); return 0; }
                if (ReadProcessMemory(h, new IntPtr(mem.Value + POS_OFFSET), buf, new IntPtr(12), out var got) && got.ToInt64() == 12)
                {
                    var (x, y, z) = Floats(buf);
                    if (Believable(x, y, z))
                    {
                        everValid = true;
                        bool moved = track.Add(x, y, z);
                        // Written when he moves, and every 5 s while he stands, so `at` says the reader is alive.
                        if (moved || clock.ElapsedMilliseconds - lastWrite >= 5000) { Write(outFile, track, true); lastWrite = clock.ElapsedMilliseconds; }
                    }
                }
                if (!everValid && clock.ElapsedMilliseconds > giveUp)
                {
                    Remove(outFile);
                    Say("fail", "the position address gave nothing believable (wrong game version or region?)");
                    return 3;
                }
                Thread.Sleep(every);
            }
            if (track.Has) Write(outFile, track, false); else Remove(outFile);
            Say("end", "Cemu closed");
            return 0;
        }
        finally { CloseHandle(h); }
    }

    /// <summary>This launch's base: the LAST base line in a log written since Cemu started (an older log is a stale base).</summary>
    public static long? BaseFromLog(string logFile, DateTime started)
    {
        try
        {
            if (!File.Exists(logFile) || File.GetLastWriteTime(logFile) < started.AddSeconds(-5)) return null;
            using var fs = new FileStream(logFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var r = new StreamReader(fs);
            return ParseBase(r.ReadToEnd());
        }
        catch { return null; }
    }
    public static long? ParseBase(string log)
    {
        var all = BaseRe.Matches(log);
        if (all.Count == 0) return null;
        return long.TryParse(all[^1].Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var b) && b > 0 ? b : null;
    }

    /// <summary>Three big-endian floats.</summary>
    public static (float x, float y, float z) Floats(byte[] b)
    {
        float F(int o) { var t = new byte[] { b[o + 3], b[o + 2], b[o + 1], b[o] }; return BitConverter.ToSingle(t, 0); }
        return (F(0), F(4), F(8));
    }

    /// <summary>xnavi's rules (gameValidTriple): real numbers, not all near zero, inside Hyrule's bounds.</summary>
    public static bool Believable(float x, float y, float z)
    {
        foreach (var v in new[] { x, y, z })
            if (float.IsNaN(v) || float.IsInfinity(v) || (v != 0 && Math.Abs(v) < 1e-6f)) return false;
        if (Math.Abs(x) < 0.01f && Math.Abs(y) < 0.01f && Math.Abs(z) < 0.01f) return false;
        return Math.Abs(x) < 7000 && Math.Abs(z) < 7000 && y > -600 && y < 5000;
    }

    /// <summary>The last position and the facing worked out from movement.</summary>
    public sealed class Track
    {
        public bool Has;
        public double X, Y, Z, Facing = -1;
        double fx, fz; bool anchored;
        /// <summary>A step under 0.5 m is standing still (and float jitter); one over 200 m in a beat is a warp or a
        /// load, which says nothing about where he faces. Returns true when the position changed.</summary>
        public bool Add(double x, double y, double z)
        {
            bool changed = !Has || Math.Abs(x - X) > 0.05 || Math.Abs(y - Y) > 0.05 || Math.Abs(z - Z) > 0.05;
            Has = true; X = x; Y = y; Z = z;
            if (!anchored) { fx = x; fz = z; anchored = true; return changed; }
            double dx = x - fx, dz = z - fz, d = Math.Sqrt(dx * dx + dz * dz);
            if (d > 200) { fx = x; fz = z; }
            else if (d >= 0.5)
            {
                // north is -z, east is +x; clockwise degrees
                Facing = Math.Round((Math.Atan2(dx, -dz) * 180 / Math.PI + 360) % 360, 1);
                fx = x; fz = z;
            }
            return changed;
        }
    }

    public static string Json(Track t, bool live, DateTime at) => JsonSerializer.Serialize(new
    {
        v = 1,
        at = at.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
        x = Math.Round(t.X, 2), y = Math.Round(t.Y, 2), z = Math.Round(t.Z, 2),
        facing = t.Facing,
        live,
    });

    static void Write(string file, Track t, bool live)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file))!);
            string tmp = $"{file}.{Environment.ProcessId}.tmp";
            File.WriteAllText(tmp, Json(t, live, DateTime.UtcNow), new UTF8Encoding(false));
            File.Move(tmp, file, true);
        }
        catch { /* a busy reader on the other side: the next beat writes again */ }
    }
    /// <summary>A pos.json left saying live (a crash, a kill) is turned to live:false; anything else is left alone.</summary>
    public static void MarkClosed(string file)
    {
        try
        {
            if (!File.Exists(file)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(file));
            var r = doc.RootElement;
            if (!r.TryGetProperty("live", out var l) || l.ValueKind != JsonValueKind.True) return;
            var t = new Track { Has = true, X = r.GetProperty("x").GetDouble(), Y = r.GetProperty("y").GetDouble(), Z = r.GetProperty("z").GetDouble(), Facing = r.GetProperty("facing").GetDouble() };
            Write(file, t, false);
        }
        catch { Remove(file); }
    }
    static void Remove(string file) { try { File.Delete(file); } catch { } }

    static DateTime SafeStart(Process p) { try { return p.StartTime; } catch { return DateTime.MinValue; } }
    static void Say(string what, string detail) => Console.WriteLine(JsonSerializer.Serialize(new { botw = what, detail }));
    static string? Str(string[] a, string name) { int i = Array.IndexOf(a, name); return i >= 0 && i + 1 < a.Length ? a[i + 1] : null; }
    static long Num(string[] a, string name, long d) => long.TryParse(Str(a, name), out var v) ? v : d;
}
