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
                var logPath = Paths.File("core.log");
                if (File.Exists(logPath) && new FileInfo(logPath).Length > 1024 * 1024) File.Delete(logPath);
                var writer = new StreamWriter(logPath, append: true) { AutoFlush = true };
                void Pipe(StreamReader r) => Task.Run(async () => { try { string? l; while ((l = await r.ReadLineAsync()) != null) lock (writer) writer.WriteLine($"{DateTime.Now:HH:mm:ss} {l}"); } catch { } });
                Pipe(child.StandardOutput); Pipe(child.StandardError);
                Set($"Core started (pid {child.Id})");
                await child.WaitForExitAsync(cts.Token);
                Set($"Core exited with code {child.ExitCode}");
                writer.Dispose();
                pause = DateTime.UtcNow - started > TimeSpan.FromMinutes(1) ? TimeSpan.FromSeconds(2) : TimeSpan.FromSeconds(Math.Min(30, pause.TotalSeconds * 2));
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) { Set("supervisor error: " + e.Message); }
            try { await Task.Delay(pause, cts.Token); } catch (OperationCanceledException) { break; }
        }
    }

    public void Dispose()
    {
        cts.Cancel();
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
