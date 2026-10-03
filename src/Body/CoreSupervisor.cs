using System.Diagnostics;
using System.Net.Sockets;
using System.Runtime.InteropServices;

namespace Aang.Body;

/// <summary>
/// Keeps the Core running so Aang works after a login with nothing else to start. If something already listens on
/// the Core's port (a Core started by hand, a test's fake Core) it does nothing. Otherwise it starts
/// <c>node src/index.ts</c> hidden, restarts it if it dies (with a growing pause so a crash loop cannot spin), and
/// ties it to a Windows job object so the Core and everything it spawned die with the Body, even if the Body crashes.
/// </summary>
sealed class CoreSupervisor : IDisposable
{
    readonly int port;
    readonly string? coreDir;
    readonly string? nodeExe;
    readonly CancellationTokenSource cts = new();
    readonly IntPtr job;
    Process? child;

    public string Status { get; private set; } = "not started";
    public event Action<string>? StatusChanged;

    public CoreSupervisor(int port, string? coreDirOverride, string? nodeOverride)
    {
        this.port = port;
        coreDir = coreDirOverride is { Length: > 0 } ? coreDirOverride : FindCoreDir();
        nodeExe = nodeOverride is { Length: > 0 } ? nodeOverride : FindNode();
        job = CreateKillOnCloseJob();
    }

    public void Start() => _ = Task.Run(RunAsync);

    /// <summary>Walk up from the Body's folder to the repo's src/Core, so the build tree and an installed copy both work.</summary>
    public static string? FindCoreDir()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
        {
            var c = Path.Combine(d.FullName, "src", "Core");
            if (File.Exists(Path.Combine(c, "src", "index.ts"))) return c;
            c = Path.Combine(d.FullName, "Core");
            if (File.Exists(Path.Combine(c, "src", "index.ts"))) return c;
        }
        return null;
    }

    public static string? FindNode()
    {
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            try { var p = Path.Combine(dir.Trim(), "node.exe"); if (File.Exists(p)) return p; } catch { /* bad PATH entry */ }
        }
        var pf = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        return File.Exists(pf) ? pf : null;
    }

    bool PortInUse()
    {
        try
        {
            using var c = new TcpClient();
            return c.ConnectAsync("127.0.0.1", port).Wait(600) && c.Connected;
        }
        catch { return false; }
    }

    void Set(string s) { if (s == Status) return; Status = s; Log.Write("core supervisor: " + s); StatusChanged?.Invoke(s); }

    /// <summary>Raised once, when restarting has been given up on. The pet says this out loud.</summary>
    public event Action<string>? GaveUp;

    // A crash loop with no limit is a pet that looks alive and does nothing, forever, quietly. The
    // backoff below resets to 2s whenever a Core survived a minute, so a Core that dies at 61 seconds
    // restarts every 63 seconds for as long as the machine is on and never escalates.
    //
    // The window has to be wide enough to catch that: five deaths at ~63s apart span about 5m15s, so a
    // five-minute window would let the oldest age out and never trip. Ten minutes catches both that and
    // a fast loop, while still being impossible to reach by accident - a healthy Core runs for hours,
    // and Shadow's own four-hour reboot produces one death, not five.
    const int BurstLimit = 5;
    static readonly TimeSpan BurstWindow = TimeSpan.FromMinutes(10);
    readonly Queue<DateTime> deaths = new();

    /// <summary>True once the Core has died too often to keep restarting. Restarting Aang clears it.</summary>
    public bool GivenUp { get; private set; }

    /// <summary>Records a death and says whether that is now a loop rather than bad luck.</summary>
    bool TooManyDeaths(DateTime now)
    {
        deaths.Enqueue(now);
        while (deaths.Count > 0 && now - deaths.Peek() > BurstWindow) deaths.Dequeue();
        return deaths.Count >= BurstLimit;
    }

    async Task RunAsync()
    {
        if (coreDir == null) { Set("Core folder not found, not starting it"); return; }
        if (nodeExe == null) { Set("Node.js not found, not starting the Core"); return; }
        var pause = TimeSpan.FromSeconds(2);
        while (!cts.IsCancellationRequested)
        {
            try
            {
                if (PortInUse()) { Set("a Core is already running"); await Task.Delay(5000, cts.Token); continue; }
                var started = DateTime.UtcNow;
                var psi = new ProcessStartInfo(nodeExe, "--no-warnings src/index.ts")
                {
                    WorkingDirectory = coreDir, UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardOutput = true, RedirectStandardError = true,
                };
                child = Process.Start(psi);
                if (child == null) { Set("Core would not start"); await Task.Delay(pause, cts.Token); continue; }
                if (job != IntPtr.Zero) AssignProcessToJobObject(job, child.Handle);
                // The Core's output MUST be drained, whether or not we can write it down.
                //
                // 2026-10-01, found after a week of damage: core.log stopped on 2026-09-24 and Aang began
                // answering with a single full stop. Same cause. The old code disposed the writer the moment
                // the Core exited, while the two fire-and-forget reader tasks still held it; they threw into a
                // bare catch and died, leaking the file handle. The NEXT spawn's StreamWriter then failed
                // because that handle still had core.log open - and it failed AFTER Process.Start, so the Core
                // was already running with its output redirected into a pipe nobody was reading. A full pipe
                // stalls the writer, which is why replies came back truncated. Once one handle leaked, every
                // restart after it failed the same way, silently, for six days.
                //
                // So: share the file rather than fight over it, keep draining even if the log cannot be opened
                // (a lost log is an inconvenience, a stalled Core is not), and wait for the readers to finish
                // before disposing anything.
                StreamWriter? writer = null;
                try
                {
                    var logPath = Paths.File("core.log");
                    if (File.Exists(logPath) && new FileInfo(logPath).Length > 1024 * 1024) File.Delete(logPath);
                    var fs = new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                    writer = new StreamWriter(fs) { AutoFlush = true };
                }
                catch (Exception e) { Set("core.log unavailable, draining output anyway: " + e.Message); }

                // Full ISO timestamps: the old HH:mm:ss had no date, so a line from last Tuesday read exactly
                // like one from this morning while diagnosing this very bug.
                var w = writer;
                Task Pipe(StreamReader r) => Task.Run(async () =>
                {
                    try
                    {
                        string? l;
                        while ((l = await r.ReadLineAsync()) != null)
                            if (w != null) lock (w) w.WriteLine($"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {l}");
                    }
                    catch (Exception e) { Set("core.log writer stopped: " + e.Message); }
                });
                var pipes = new[] { Pipe(child.StandardOutput), Pipe(child.StandardError) };
                Set($"Core started (pid {child.Id})");
                await child.WaitForExitAsync(cts.Token);
                Set($"Core exited with code {child.ExitCode}");
                // Let the readers finish the tail of the output before the writer goes away. Without this the
                // dispose races them, which is the leak that started all of the above.
                try { await Task.WhenAll(pipes).WaitAsync(TimeSpan.FromSeconds(5)); } catch { /* a slow tail must not block the restart */ }
                writer?.Dispose();

                // Stop rather than loop forever. Without this, a Core that cannot stay up is invisible:
                // the pet sits there looking perfectly normal while nothing behind it works, which is the
                // same silent-failure shape as the write that died for six days.
                if (TooManyDeaths(DateTime.UtcNow))
                {
                    GivenUp = true;
                    var ran = (int)(DateTime.UtcNow - started).TotalSeconds;
                    Set($"gave up after {BurstLimit} crashes in {BurstWindow.TotalMinutes:0} minutes");
                    GaveUp?.Invoke($"My brain keeps crashing, {BurstLimit} times in the last {BurstWindow.TotalMinutes:0} minutes, " +
                                   $"the last one after {ran} second{(ran == 1 ? "" : "s")}. I have stopped trying so it does not loop forever. " +
                                   "Restart me once you have had a look at core.log.");
                    return;
                }

                pause = DateTime.UtcNow - started > TimeSpan.FromMinutes(1) ? TimeSpan.FromSeconds(2) : TimeSpan.FromSeconds(Math.Min(30, pause.TotalSeconds * 2));
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) { Set("supervisor error: " + e.Message); }
            try { await Task.Delay(pause, cts.Token); } catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>
    /// Wait for the Core to stop on its own, having been asked over the socket.
    /// </summary>
    /// <remarks>
    /// Windows has no way to send a real SIGTERM from .NET - Process.Kill is always a hard terminate - so
    /// the polite request travels over the WebSocket the Body already holds, and this only waits for the
    /// result. Bounded, because a Core that will not stop must not stop the Body closing: Dispose kills it
    /// anyway afterwards. Returns true if it went quietly.
    /// </remarks>
    public bool WaitForExit(TimeSpan within)
    {
        if (child is not { HasExited: false }) return true;
        try { return child.WaitForExit((int)within.TotalMilliseconds); }
        catch { return true; }                      // already gone, or never really started
    }

    public void Dispose()
    {
        cts.Cancel();
        // Still a hard kill, and deliberately: by now the Core has been asked and given its moment. This is
        // the fallback for a Core that is wedged, not the normal path it used to be.
        try { if (child is { HasExited: false }) child.Kill(entireProcessTree: true); } catch { /* already gone */ }
        if (job != IntPtr.Zero) Win32.CloseHandle(job);
    }

    // --- job object: everything in it is killed when the last handle closes (the Body exiting, or crashing)
    [StructLayout(LayoutKind.Sequential)] struct BASIC { public long a, b; public uint Flags; public UIntPtr min, max; public uint pc; public UIntPtr aff; public uint pri, sched; }
    [StructLayout(LayoutKind.Sequential)] struct IOC { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)] struct EXT { public BASIC Basic; public IOC Io; public UIntPtr pm, jm, ppm, pk; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attrs, string? name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int cls, ref EXT info, int size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);

    static IntPtr CreateKillOnCloseJob()
    {
        try
        {
            var j = CreateJobObject(IntPtr.Zero, null);
            if (j == IntPtr.Zero) return IntPtr.Zero;
            var info = new EXT { Basic = new BASIC { Flags = 0x2000 } };   // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            return SetInformationJobObject(j, 9, ref info, Marshal.SizeOf<EXT>()) ? j : IntPtr.Zero;
        }
        catch { return IntPtr.Zero; }
    }
}
