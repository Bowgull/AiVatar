// AangReader --botw-live --out <pos.json> --live <live.json> --pouch <pouch.json> --want <want.json>
//                        [--log <Cemu log.txt>] [--parent <pid>] [--give-up <ms>] [--base-wait <ms>]
//
// BG10 (docs/BOTW-GUIDE.md, his interview of 2026-11-04; research: Aang/research_notes/BotW guide/live_memory.md).
// One process in place of --botw-pos. It keeps writing pos.json exactly as BotwPos does (same address, once a second),
// and, ONLY while a guide page is open (a fresh want.json, written by the Shell's page server while a page listens),
// it also reads, twice a second:
//   live.json   hearts and stamina with the yellow extras, rupees, the arrow count, what Link wears and holds
//   pouch.json  his whole pouch as the game holds it now (for the Journal's Cooking: the live bag), once a second
// Each file is written whole (temp + rename) only when something in it changed, plus a heartbeat every 5 s.
//
// Read-only, always, as BotwPos: PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION and ReadProcessMemory. No
// injection, no writes, no debugger port, no keys.
//
// Every address is for BotW v1.5.0 (v208, one build in every region) and NONE has been seen on his running game yet
// (2026-11-04). So: the build is proven first by two strings in the game's own data; every pointer followed must be a
// real guest address; every value must be believable or it is not written. The first good read prints a "probe" line
// (the raw numbers) for the brain's log, so his first session checks the addresses without him doing anything.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace Aang.Reader;

/// <summary>The game's memory, by guest address. The real one is Cemu (base + address); tests pass a made-up image.</summary>
public interface IGuestMem { bool Read(long guest, byte[] buf, int n); }

/// <summary>The pure reading: follows the game's pointers and says what it found. No files, no clock, no process.</summary>
public sealed class BotwLiveReader
{
    // Static roots in the v208 RPX's data (each a big-endian u32 pointer, null until the game is running a save).
    public const long PLAYER_INFO = 0x10463F38, PAUSE_MGR = 0x10469978, GDT_MGR = 0x1046D5B0;
    // The build is v208 when these two names sit here (checked in his own U-King.rpx; other versions put them elsewhere).
    public const long STR_MAXHART = 0x10202814, STR_ENERGYADD = 0x101E83B8;
    // PlayerInfo: +0x30 the player actor, +0x4C his position, +0x64 red-heart cap (f32, quarter hearts),
    // +0x68 green stamina now (f32, 1000 = one wheel), +0x6C green stamina cap.
    const int PI_FROM = 0x30, PI_LEN = 0x40;
    // The player actor: +0x540 life now (s32, quarter hearts, red and yellow together), +0x1320 the most life he can
    // have now, +0x1A24 yellow hearts granted (s32 quarters), +0x1A28 yellow stamina (f32).
    const int A_LIFE = 0x540, A_MAXLIFE = 0x1320, A_YELLOW_H = 0x1A24, A_YELLOW_S = 0x1A28;
    // The pouch (PauseMenuDataMgr): the item list's sentinel node at +0x4C, the node's place inside an item at +0x58.
    const int M_LIST = 0x4C, M_NODE_OFFSET = 0x58;
    // A pouch item: +0x08 kind, +0x10 count or durability, +0x14 worn / in hand, +0x15 really in the pouch, the name's
    // text inline at +0x24 (up to 64 bytes); food only: +0x64 hearts, +0x68 seconds, +0x70 effect, +0x74 level.
    const int I_LEN = 0x78, I_TYPE = 0x08, I_VALUE = 0x10, I_EQUIPPED = 0x14, I_IN = 0x15, I_NAME = 0x24;
    public const int MAX_ITEMS = 2048;
    // Any game flag by name (GameDataMgr): mgr -> +0x710 -> the flag tables; s32 flags: count +0x10, pointers +0x18;
    // a flag object: value +0x14, name hash (CRC32) +0x18.
    const int G_SLOT = 0x710, T_S32_COUNT = 0x10, T_S32_ARRAY = 0x18, F_VALUE = 0x14, F_HASH = 0x18;

    readonly IGuestMem m;
    readonly byte[] b4 = new byte[4], pi = new byte[PI_LEN], item = new byte[I_LEN];
    long rupeeFlag;           // the CurrentRupee flag object, once found
    int nextAt = -1;          // where a list node keeps "next" (0 or 4), learned from the first node
    public BotwLiveReader(IGuestMem mem) { m = mem; }

    public static bool ValidPtr(long p) => p >= 0x10000000 && p < 0xA0000000 && (p & 3) == 0;
    static uint Be32(byte[] b, int o) => (uint)(b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]);
    static float BeF(byte[] b, int o) => BitConverter.Int32BitsToSingle((int)Be32(b, o));
    long Ptr(long at) => m.Read(at, b4, 4) ? Be32(b4, 0) : 0;
    int? S32(long at) => m.Read(at, b4, 4) ? (int)Be32(b4, 0) : null;
    float? F32(long at) => m.Read(at, b4, 4) ? BeF(b4, 0) : null;
    static bool Real(float f) => !float.IsNaN(f) && !float.IsInfinity(f);

    /// <summary>This is BotW v208: two of its own names sit where that build keeps them.</summary>
    public bool IsV208()
    {
        return Has(STR_MAXHART, "MaxHartValue") && Has(STR_ENERGYADD, "Item_EnergyMaxAdd");
        bool Has(long at, string s) { var b = new byte[s.Length + 1]; return m.Read(at, b, b.Length) && b[^1] == 0 && Encoding.ASCII.GetString(b, 0, s.Length) == s; }
    }

    public sealed class Vitals
    {
        public long Actor;
        public int Life, Cap, Yellow;             // quarter hearts: now (red + yellow), red cap, yellow he has now
        public double Green, StaminaCap, YellowStamina;   // 1000 = one wheel
        public int MaxLife, YellowGranted;        // raw, for the probe line
        public float X, Y, Z;
    }
    /// <summary>"play" with the numbers; "menu" when the game has no player yet (title, game list); "loading" when
    /// there is one but the numbers are not believable (a load, a warp).</summary>
    public (string state, Vitals? v) ReadVitals()
    {
        long info = Ptr(PLAYER_INFO);
        if (!ValidPtr(info) || !m.Read(info + PI_FROM, pi, PI_LEN)) return ("menu", null);
        long actor = Be32(pi, 0);
        if (!ValidPtr(actor)) return ("menu", null);
        float cap = BeF(pi, 0x64 - PI_FROM), green = BeF(pi, 0x68 - PI_FROM), scap = BeF(pi, 0x6C - PI_FROM);
        int? life = S32(actor + A_LIFE), maxLife = S32(actor + A_MAXLIFE), yh = S32(actor + A_YELLOW_H);
        float? ys = F32(actor + A_YELLOW_S);
        if (life == null || maxLife == null || yh == null || ys == null) return ("loading", null);
        if (!Real(cap) || !Real(green) || !Real(scap) || !Real(ys.Value)) return ("loading", null);
        int capQ = (int)Math.Round(cap);
        // 3 to 30 hearts; one to three wheels; never more life than the red cap and the yellow together
        if (capQ < 12 || capQ > 120 || Math.Abs(cap - capQ) > 0.01f) return ("loading", null);
        if (scap < 999 || scap > 3001 || green < -1 || green > scap + 1) return ("loading", null);
        if (yh.Value < 0 || yh.Value > 120 || ys.Value < -1 || ys.Value > 3001) return ("loading", null);
        if (life.Value < 0 || life.Value > capQ + yh.Value) return ("loading", null);
        return ("play", new Vitals
        {
            Actor = actor, Life = life.Value, Cap = capQ, Yellow = Math.Clamp(life.Value - capQ, 0, yh.Value),
            Green = Math.Round(Math.Clamp(green, 0, scap), 0), StaminaCap = Math.Round(scap, 0), YellowStamina = Math.Round(Math.Max(0, ys.Value), 0),
            MaxLife = maxLife.Value, YellowGranted = yh.Value,
            X = BeF(pi, 0x4C - PI_FROM), Y = BeF(pi, 0x50 - PI_FROM), Z = BeF(pi, 0x54 - PI_FROM),
        });
    }

    public sealed record Item(int Type, string Id, int Value, bool Equipped, int Hearts, int Seconds, int Effect, int Level);
    /// <summary>His whole pouch, in the game's order, or null when the list is not there or does not read as one
    /// (a load). Kinds: 0 sword, 1 bow, 2 arrow, 3 shield, 4/5/6 head/body/legs, 7 material, 8 food, 9 key item.</summary>
    public List<Item>? ReadPouch()
    {
        long mgr = Ptr(PAUSE_MGR);
        if (!ValidPtr(mgr)) return null;
        long sentinel = mgr + M_LIST;
        var head = new byte[16];
        if (!m.Read(sentinel, head, 16)) return null;
        long first = Be32(head, 4); int offset = (int)Be32(head, M_NODE_OFFSET - M_LIST);
        if (offset < 0 || offset > 0x40 || (offset & 3) != 0) return null;
        var list = new List<Item>();
        if (first == sentinel) return list;   // an empty pouch
        if (!ValidPtr(first)) return null;
        long node = first;
        for (int i = 0; i < MAX_ITEMS && node != sentinel; i++)
        {
            if (!ValidPtr(node) || !m.Read(node - offset, item, I_LEN)) return null;
            if (nextAt < 0)
            {
                // the first node's "previous" is the sentinel: the other word is "next"
                long w0 = Be32(item, offset), w4 = Be32(item, offset + 4);
                nextAt = w0 == sentinel ? 4 : w4 == sentinel ? 0 : -1;
                if (nextAt < 0) return null;
            }
            int type = (int)Be32(item, I_TYPE);
            if (type < 0 || type > 9) return null;
            string? id = Name(item, I_NAME);
            if (id == null) return null;
            if (item[I_IN] != 0)
            {
                bool food = type == 8;
                list.Add(new Item(type, id, (int)Be32(item, I_VALUE), item[I_EQUIPPED] != 0,
                    food ? (int)Be32(item, 0x64) : 0, food ? (int)Be32(item, 0x68) : 0,
                    food ? Whole(BeF(item, 0x70)) : 0, food ? Whole(BeF(item, 0x74)) : 0));
            }
            node = Be32(item, offset + nextAt);
        }
        return node == sentinel ? list : null;   // a list that never came back round is not a list
        static int Whole(float f) => Real(f) && f > -1 && f < 100 ? (int)Math.Round(f) : 0;
    }
    /// <summary>An actor name as the game writes it: 3 to 63 letters, digits and underscores, then a zero.</summary>
    static string? Name(byte[] b, int at)
    {
        int n = 0;
        while (n < 64 && b[at + n] != 0) { byte c = b[at + n]; if (!(c == '_' || (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z'))) return null; n++; }
        return n >= 3 && n < 64 ? Encoding.ASCII.GetString(b, at, n) : null;
    }

    /// <summary>His rupees (the game flag CurrentRupee), or null when the flags are not loaded. The flag is found once
    /// by its name's hash and its hash is checked again on every read (a reload moves it).</summary>
    public int? ReadRupees()
    {
        uint want = Crc32("CurrentRupee");
        var obj = new byte[0x20];
        if (rupeeFlag != 0 && m.Read(rupeeFlag, obj, 0x20) && Be32(obj, F_HASH) == want) return Believe((int)Be32(obj, F_VALUE));
        rupeeFlag = 0;
        long mgr = Ptr(GDT_MGR); if (!ValidPtr(mgr)) return null;
        long slot = Ptr(mgr + G_SLOT); if (!ValidPtr(slot)) return null;
        long table = Ptr(slot); if (!ValidPtr(table)) return null;
        int? count = S32(table + T_S32_COUNT); long array = Ptr(table + T_S32_ARRAY);
        if (count == null || count < 1 || count > 20000 || !ValidPtr(array)) return null;
        var ptrs = new byte[count.Value * 4];
        if (!m.Read(array, ptrs, ptrs.Length)) return null;
        for (int i = 0; i < count.Value; i++)
        {
            long p = Be32(ptrs, i * 4);
            if (!ValidPtr(p) || !m.Read(p, obj, 0x20) || Be32(obj, F_HASH) != want) continue;
            rupeeFlag = p; return Believe((int)Be32(obj, F_VALUE));
        }
        return null;
        static int? Believe(int v) => v >= 0 && v <= 999_999 ? v : null;
    }

    static readonly uint[] CrcTable = Enumerable.Range(0, 256).Select(i => { uint c = (uint)i; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1; return c; }).ToArray();
    public static uint Crc32(string s) { uint c = 0xFFFFFFFF; foreach (byte x in Encoding.ASCII.GetBytes(s)) c = CrcTable[(c ^ x) & 0xFF] ^ (c >> 8); return c ^ 0xFFFFFFFF; }
}

/// <summary>What the files say. Pure: the same reads give the same text (the time and the count are added on writing).</summary>
public static class BotwLiveDoc
{
    static readonly string[] SLOTS = { "sword", "bow", "arrow", "shield", "head", "upper", "lower" };
    /// <summary>live.json's body. hearts are quarter hearts, stamina is 1000 a wheel; equip holds actor names or null.</summary>
    public static Dictionary<string, object?> Live(string state, BotwLiveReader.Vitals? v, int? rupees, List<BotwLiveReader.Item>? pouch)
    {
        var d = new Dictionary<string, object?> { ["state"] = state };
        if (v != null)
        {
            d["hearts"] = new { life = v.Life, cap = v.Cap, yellow = v.Yellow };
            d["stamina"] = new { green = v.Green, cap = v.StaminaCap, yellow = v.YellowStamina };
        }
        if (rupees != null) d["rupees"] = rupees;
        if (pouch != null)
        {
            var eq = new Dictionary<string, string?>();
            foreach (var s in SLOTS) eq[s] = null;
            foreach (var it in pouch) if (it.Equipped && it.Type <= 6) eq[SLOTS[it.Type]] = it.Id;
            d["equip"] = eq;
            var arrow = pouch.FirstOrDefault(it => it.Equipped && it.Type == 2);
            d["arrows"] = arrow?.Value ?? 0;
        }
        return d;
    }
    /// <summary>pouch.json's body: every item, in the game's order. t = kind, n = count (durability x100 for gear).</summary>
    public static Dictionary<string, object?> Pouch(List<BotwLiveReader.Item> pouch) => new()
    {
        ["items"] = pouch.Select(it => it.Type == 8
            ? (object)new { t = it.Type, id = it.Id, n = it.Value, hp = it.Hearts, time = it.Seconds, effect = it.Effect, level = it.Level }
            : it.Type <= 6 ? new { t = it.Type, id = it.Id, n = it.Value, on = it.Equipped } : new { t = it.Type, id = it.Id, n = it.Value }).ToList(),
    };
    public static string Body(Dictionary<string, object?> d) => JsonSerializer.Serialize(d);
    /// <summary>The file: v, at, seq, live, then the body's fields.</summary>
    public static string File(Dictionary<string, object?> body, bool live, long seq, DateTime at)
    {
        var d = new Dictionary<string, object?> { ["v"] = 1, ["at"] = at.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture), ["seq"] = seq, ["live"] = live };
        foreach (var kv in body) d[kv.Key] = kv.Value;
        return JsonSerializer.Serialize(d);
    }
}

static class BotwLive
{
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    const uint PROCESS_VM_READ = 0x0010, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    sealed class CemuMem : IGuestMem
    {
        readonly IntPtr h; readonly long b;
        public CemuMem(IntPtr handle, long hostBase) { h = handle; b = hostBase; }
        public bool Read(long guest, byte[] buf, int n) => ReadProcessMemory(h, new IntPtr(b + guest), buf, new IntPtr(n), out var got) && got.ToInt64() == n;
    }

    /// <summary>Half a second a beat: the vitals every beat, position and the pouch every other one.</summary>
    public const int BEAT_MS = 500;
    /// <summary>A page wants the live values while want.json is younger than this (the page server refreshes it every 10 s).</summary>
    public const int LEASE_MS = 25_000;
    public const int HEARTBEAT_MS = 5000;

    public static int Run(string[] args)
    {
        string? posOut = BotwPos.Str(args, "--out"), liveOut = BotwPos.Str(args, "--live"), pouchOut = BotwPos.Str(args, "--pouch"), wantFile = BotwPos.Str(args, "--want");
        if (posOut == null || liveOut == null || pouchOut == null || wantFile == null) { BotwPos.Say("fail", "needs --out, --live, --pouch and --want"); return 2; }
        string logFile = BotwPos.Str(args, "--log") ?? BotwPos.DEFAULT_LOG;
        int giveUp = (int)BotwPos.Num(args, "--give-up", 300_000), baseWait = (int)BotwPos.Num(args, "--base-wait", 180_000);

        var cemu = Process.GetProcessesByName("Cemu").OrderBy(p => BotwPos.SafeStart(p)).LastOrDefault();
        if (cemu == null) { BotwPos.MarkClosed(posOut); Closed(liveOut); BotwPos.Say("end", "Cemu is not running"); return 0; }
        var waited = Stopwatch.StartNew();
        long? mem = BotwPos.BaseFromLog(logFile, BotwPos.SafeStart(cemu));
        while (mem == null && waited.ElapsedMilliseconds < baseWait && !cemu.HasExited) { Thread.Sleep(1000); mem = BotwPos.BaseFromLog(logFile, BotwPos.SafeStart(cemu)); }
        if (cemu.HasExited) { BotwPos.MarkClosed(posOut); Closed(liveOut); BotwPos.Say("end", "Cemu closed"); return 0; }
        if (mem == null) { BotwPos.Remove(posOut); BotwPos.Say("fail", "no memory base for this Cemu launch in its log"); return BotwPos.NOT_READY; }

        IntPtr h = OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, false, cemu.Id);
        if (h == IntPtr.Zero) { BotwPos.Remove(posOut); BotwPos.Say("fail", $"could not open Cemu to read (error {Marshal.GetLastWin32Error()})"); return BotwPos.GAVE_UP; }
        BotwPos.Say("start", $"reading Cemu {cemu.Id} at base 0x{mem.Value:x} (live)");
        try
        {
            var guest = new CemuMem(h, mem.Value);
            var reader = new BotwLiveReader(guest);
            var track = new BotwPos.Track();
            var buf = new byte[12];
            var clock = Stopwatch.StartNew();
            bool everValid = false, wasWanted = false, probed = false; bool? v208 = null;
            long lastPos = -10_000, lastLive = -10_000, lastPouch = -10_000, seq = 0, beat = 0;
            string liveBody = "", pouchBody = "";
            List<BotwLiveReader.Item>? pouch = null; int? rupees = null;
            Process? parent = null;
            try { long pp = BotwPos.Num(args, "--parent", 0); if (pp > 0) parent = Process.GetProcessById((int)pp); } catch { }
            while (!cemu.HasExited)
            {
                if (parent != null && parent.HasExited) { Closed(liveOut); BotwPos.Say("end", "the brain left"); return 0; }
                bool second = beat++ % 2 == 0;
                // ---- position, exactly as --botw-pos: once a second, written on a move and every 5 s
                if (second && guest.Read(BotwPos.POS_OFFSET, buf, 12))
                {
                    var (x, y, z) = BotwPos.Floats(buf);
                    if (BotwPos.Believable(x, y, z))
                    {
                        everValid = true;
                        bool moved = track.Add(x, y, z);
                        if (moved || clock.ElapsedMilliseconds - lastPos >= HEARTBEAT_MS) { BotwPos.Write(posOut, track, true); lastPos = clock.ElapsedMilliseconds; }
                    }
                }
                if (!everValid && clock.ElapsedMilliseconds > giveUp)
                {
                    BotwPos.Remove(posOut); Closed(liveOut);
                    BotwPos.Say("fail", "the position address gave nothing believable (wrong game version or region?)");
                    return BotwPos.GAVE_UP;
                }
                // ---- the live values: only while a guide page is open
                bool wanted = Wanted(wantFile);
                if (wanted)
                {
                    v208 ??= reader.IsV208();
                    if (v208 == false)
                    {
                        // not this build (or another game in the same Cemu): say so once, look again in a minute
                        if (!probed) { BotwPos.Say("live-off", "this is not BotW v208: the live values stay off, the position is as before"); probed = true; }
                        if (beat % 120 == 0) { v208 = null; }
                    }
                    else
                    {
                        var (state, v) = reader.ReadVitals();
                        if (second || pouch == null) { pouch = v != null ? reader.ReadPouch() : null; rupees = v != null ? reader.ReadRupees() : null; }
                        if (v != null && !probed)
                        {
                            probed = true;
                            BotwPos.Say("probe", $"life {v.Life} cap {v.Cap} maxLife@1320 {v.MaxLife} yellowHearts {v.YellowGranted} stamina {v.Green}/{v.StaminaCap} yellowStamina {v.YellowStamina} " +
                                $"rupees {(rupees?.ToString() ?? "none")} pouch {(pouch?.Count.ToString() ?? "none")} pos@PlayerInfo {v.X:0.0},{v.Y:0.0},{v.Z:0.0} pos@heap {track.X:0.0},{track.Y:0.0},{track.Z:0.0}");
                        }
                        var body = BotwLiveDoc.Body(BotwLiveDoc.Live(state, v, rupees, pouch));
                        long now = clock.ElapsedMilliseconds;
                        // a load keeps the last good numbers in the file: only the state word changes
                        if (v != null || state != "play")
                        {
                            if (v == null && liveBody != "") body = WithState(liveBody, state);
                            if (body != liveBody || now - lastLive >= HEARTBEAT_MS) { liveBody = body; WriteFile(liveOut, BotwLiveDoc.File(JsonSerializer.Deserialize<Dictionary<string, object?>>(body)!, true, ++seq, DateTime.UtcNow)); lastLive = now; }
                        }
                        if (pouch != null && second)
                        {
                            var pb = BotwLiveDoc.Body(BotwLiveDoc.Pouch(pouch));
                            if (pb != pouchBody || now - lastPouch >= 60_000) { pouchBody = pb; WriteFile(pouchOut, BotwLiveDoc.File(BotwLiveDoc.Pouch(pouch), true, seq, DateTime.UtcNow)); lastPouch = now; }
                        }
                    }
                }
                else if (wasWanted) { Closed(liveOut); liveBody = ""; pouch = null; }   // the page closed: the file says so
                wasWanted = wanted;
                Thread.Sleep(BEAT_MS);
            }
            if (track.Has) BotwPos.Write(posOut, track, false); else BotwPos.Remove(posOut);
            Closed(liveOut);
            BotwPos.Say("end", "Cemu closed");
            return 0;
        }
        finally { CloseHandle(h); }
    }

    /// <summary>A page is listening: want.json was written in the last LEASE_MS.</summary>
    public static bool Wanted(string wantFile)
    {
        try { return File.Exists(wantFile) && (DateTime.UtcNow - File.GetLastWriteTimeUtc(wantFile)).TotalMilliseconds < LEASE_MS; } catch { return false; }
    }
    static string WithState(string body, string state)
    {
        var d = JsonSerializer.Deserialize<Dictionary<string, object?>>(body)!; d["state"] = state; return JsonSerializer.Serialize(d);
    }
    /// <summary>live.json left saying live is turned to live:false, its last numbers kept.</summary>
    public static void Closed(string file)
    {
        try
        {
            if (!File.Exists(file)) return;
            var d = JsonSerializer.Deserialize<Dictionary<string, object?>>(File.ReadAllText(file));
            if (d == null || d.TryGetValue("live", out var l) && l is JsonElement e && e.ValueKind == JsonValueKind.False) return;
            d["live"] = false; d["state"] = "closed";
            WriteFile(file, JsonSerializer.Serialize(d));
        }
        catch { BotwPos.Remove(file); }
    }
    static void WriteFile(string file, string text)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file))!);
            string tmp = $"{file}.{Environment.ProcessId}.tmp";
            File.WriteAllText(tmp, text, new UTF8Encoding(false));
            File.Move(tmp, file, true);
        }
        catch { /* a busy reader on the other side: the next beat writes again */ }
    }
}
