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
    /// <summary>
    /// What this supervisor looks after. Added 2026-10-04 so the Shell (Aang's windows) gets the same
    /// treatment as the Core without a second copy of this class: every hard-won fix below - the drained
    /// output, the shared log handle, the burst limit, the job object - was paid for once already.
    /// </summary>
    internal readonly record struct ChildSpec(
        string Name,        // "Core" or "Shell", used in the status line and the log
        string LogFile,     // core.log, shell.log
        int Port,           // 0 means nothing listens, so do not check whether it is already running
        string? Dir,        // working directory
        string? Exe,        // the program to run
        string Args,
        string GiveUpSays,  // what Aang says out loud when it has crashed too often
        Func<string, string>? PickExe = null,          // 6.28: choose the program afresh at every start (the Shell's engine)
        Action<string, TimeSpan>? AfterExit = null,    // 6.28: told what ran and for how long, at every exit
        // 2026-10-29 (his pick: Samara from GitHub on the PC too): the folder to run, chosen afresh at every start (an
        // installed release, or Dir). Dir stays the code folder: the engine and the paid-video runtime live there.
        Func<string>? PickDir = null,
        // Samara on its own (his ask, 2026-10-20): the Shell holds his browser, so it is not tied to the pet. It is
        // left out of the job object (a pet that crashes does not take his tabs with it), writes its own log (no
        // pipe that breaks when the pet goes), is never killed when the pet closes, and one already running is
        // joined rather than started twice.
        bool Independent = false);

    readonly ChildSpec spec;
    /// <summary>What this supervisor starts (for the tests).</summary>
    internal ChildSpec Spec => spec;
    readonly CancellationTokenSource cts = new();
    readonly IntPtr job;
    Process? child;
    /// <summary>A Shell (Samara) that was already open when the pet started, and that the pet joined instead of starting.</summary>
    volatile Process? joined;

    public string Status { get; private set; } = "not started";
    public event Action<string>? StatusChanged;

    internal CoreSupervisor(ChildSpec spec)
    {
        this.spec = spec;
        job = CreateKillOnCloseJob();
    }

    public CoreSupervisor(int port, string? coreDirOverride, string? nodeOverride)
        : this(new ChildSpec(
            Name: "Core",
            LogFile: "core.log",
            Port: port,
            Dir: coreDirOverride is { Length: > 0 } ? coreDirOverride : FindCoreDir(),
            Exe: nodeOverride is { Length: > 0 } ? nodeOverride : FindNode(),
            Args: "--no-warnings src/index.ts",
            GiveUpSays: "My brain keeps crashing"))
    { }

    /// <summary>Aang's windows: the Electron Shell, run by the Electron that ships inside it.</summary>
    public static CoreSupervisor ForShell(string? shellDirOverride)
    {
        var dir = shellDirOverride is { Length: > 0 } ? shellDirOverride : FindShellDir();
        string? ranDir = null;
        return new CoreSupervisor(new ChildSpec(
            Name: "Shell",
            LogFile: "shell.log",
            Port: 0,                                  // it listens on nothing; it connects out to the Core
            Dir: dir,
            Exe: dir == null ? null : Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe"),
            Args: "src/main.ts",
            GiveUpSays: "My windows keep crashing",
            Independent: true,
            // 6.28: an updated engine if the brain has tested one, rolled back if it dies early (EnginePointer).
            PickExe: dir == null ? null : fallback => EnginePointer.Pick(dir, fallback),
            // 2026-10-29: Samara's own code from its installed release when there is one, rolled back if it dies early.
            PickDir: dir == null ? null : () => ranDir = SamaraPointer.Pick(SamaraPointer.DefaultRoot) ?? dir!,
            AfterExit: dir == null ? null : (ran, ranFor) =>
            {
                EnginePointer.AfterExit(dir, ran, ranFor);
                if (ranDir != null) SamaraPointer.AfterExit(SamaraPointer.DefaultRoot, ranDir, ranFor);
            }));
    }

    /// <summary>Walk up to the repo's src/Shell, the same way the Core is found.</summary>
    public static string? FindShellDir()
    {
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d != null; d = d.Parent)
        {
            var c = Path.Combine(d.FullName, "src", "Shell");
            if (File.Exists(Path.Combine(c, "src", "main.ts"))) return c;
            c = Path.Combine(d.FullName, "Shell");
            if (File.Exists(Path.Combine(c, "src", "main.ts"))) return c;
        }
        return null;
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
        if (spec.Port == 0) return false;             // the Shell listens on nothing: never "already running"
        try
        {
            using var c = new TcpClient();
            return c.ConnectAsync("127.0.0.1", spec.Port).Wait(600) && c.Connected;
        }
        catch { return false; }
    }

    void Set(string s) { if (s == Status) return; Status = s; Log.Write($"{spec.Name.ToLowerInvariant()} supervisor: " + s); StatusChanged?.Invoke(s); }

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
    /// <summary>The child is up right now (started and not exited), or the Shell the pet joined is.</summary>
    /// <remarks>2026-10-21: a joined Shell counts. Before, `child` stayed null when Samara was already open, so the pet
    /// thought the windows were down and drew his greeting in his OLD bubble beside the new one: the two bubbles stacked
    /// on Joshua's screen (a hover hello over the chat box's "N MIN AGO" line).</remarks>
    public bool Running { get { try { return child is { HasExited: false } || joined is { HasExited: false }; } catch { return false; } } }

    /// <summary>Records a death and says whether that is now a loop rather than bad luck.</summary>
    bool TooManyDeaths(DateTime now)
    {
        deaths.Enqueue(now);
        while (deaths.Count > 0 && now - deaths.Peek() > BurstWindow) deaths.Dequeue();
        return deaths.Count >= BurstLimit;
    }

    async Task RunAsync()
    {
        if (spec.Dir == null) { Set($"{spec.Name} folder not found, not starting it"); return; }
        if (spec.Exe == null || !File.Exists(spec.Exe))
        {
            Set($"{spec.Name}: {(spec.Name == "Core" ? "Node.js" : "Electron")} not found, not starting it");
            return;
        }
        var pause = TimeSpan.FromSeconds(2);
        while (!cts.IsCancellationRequested)
        {
            try
            {
                if (PortInUse()) { Set($"a {spec.Name} is already running"); await Task.Delay(5000, cts.Token); continue; }
                // Samara was already open on its own: join it, and take over only once it has gone.
                if (spec.Independent && RunningShell() is { } there)
                {
                    Set($"{spec.Name} already running (pid {there.Id}), joined it");
                    joined = there;
                    try { await there.WaitForExitAsync(cts.Token); } finally { joined = null; there.Dispose(); }
                    Set($"{spec.Name} closed");
                    pause = TimeSpan.FromSeconds(2);
                    goto Again;
                }
                var started = DateTime.UtcNow;
                var exe = spec.PickExe?.Invoke(spec.Exe) ?? spec.Exe;
                var args = spec.Args;
                if (spec.Independent && NextExtra is { Length: > 0 } extra) { args += " " + extra; NextExtra = null; }
                var psi = new ProcessStartInfo(exe, args)
                {
                    WorkingDirectory = spec.PickDir?.Invoke() ?? spec.Dir, UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardOutput = !spec.Independent, RedirectStandardError = !spec.Independent,
                };
                // Samara run from a release still finds the code folder's engines and paid-video runtime.
                if (spec.PickDir != null && spec.Dir != null) psi.Environment["AANG_SHELL_HOME"] = spec.Dir;
                // P1: the pet's answer, for the code that is about to run (see SamaraApart).
                if (spec.Independent) psi.Environment["AANG_SAMARA_APART"] = ApartFor(psi.WorkingDirectory) ? "1" : "0";
                child = Process.Start(psi);
                if (child == null) { Set($"{spec.Name} would not start"); await Task.Delay(pause, cts.Token); continue; }
                if (spec.Independent)
                {
                    Set($"{spec.Name} started (pid {child.Id}, on its own)");
                    await child.WaitForExitAsync(cts.Token);
                    Set($"{spec.Name} exited with code {child.ExitCode}");
                    // A planned restart (exit 75: an update going in) is not a trial failing (2026-11-20: the engine update's restart
                    // rolled Samara 1.60.1 back, 162 s into its trial).
                    if (child.ExitCode != PlannedRestart) try { spec.AfterExit?.Invoke(exe, DateTime.UtcNow - started); } catch (Exception e) { Set("after-exit check failed: " + e.Message); }
                    if (child.ExitCode == PlannedRestart) { pause = TimeSpan.FromMilliseconds(150); Set($"{spec.Name} restarting for an update"); goto Again; }
                    // He closed Samara with the pet running: the Shell quits only when told to, so this is a crash.
                    if (TooManyDeaths(DateTime.UtcNow)) { GivenUp = true; Set($"gave up after {BurstLimit} crashes"); GaveUp?.Invoke($"{spec.GiveUpSays}. I have stopped trying so it does not loop forever."); return; }
                    pause = DateTime.UtcNow - started > TimeSpan.FromMinutes(1) ? TimeSpan.FromSeconds(2) : TimeSpan.FromSeconds(Math.Min(30, pause.TotalSeconds * 2));
                    goto Again;
                }
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
                    var logPath = Paths.File(spec.LogFile);
                    // 5.1: rotate, do not delete. This deleted the whole file past 1 MiB, so with six
                    // restarts a day the evidence of an incident could be gone before anyone looked -
                    // exactly what happened on 2026-09-24, when the Core stopped writing and nobody could
                    // have known for six days. One previous generation is the difference between "what
                    // happened just before it died" and nothing. Same rule as Log.Write for body.log.
                    if (File.Exists(logPath) && new FileInfo(logPath).Length > 1024 * 1024)
                    {
                        var old = logPath + ".1";
                        try { File.Delete(old); } catch { /* no previous generation */ }
                        // A move can fail if something still holds the file; losing one generation is
                        // better than letting the log grow without limit.
                        try { File.Move(logPath, old); } catch { try { File.Delete(logPath); } catch { /* keep going */ } }
                    }
                    var fs = new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                    writer = new StreamWriter(fs) { AutoFlush = true };
                }
                catch (Exception e) { Set($"{spec.LogFile} unavailable, draining output anyway: " + e.Message); }

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
                    catch (Exception e) { Set($"{spec.LogFile} writer stopped: " + e.Message); }
                });
                var pipes = new[] { Pipe(child.StandardOutput), Pipe(child.StandardError) };
                Set($"{spec.Name} started (pid {child.Id})");
                await child.WaitForExitAsync(cts.Token);
                Set($"{spec.Name} exited with code {child.ExitCode}");
                // A planned restart (exit 75: an update going in) is not a trial failing (2026-11-20: the engine update's restart
                    // rolled Samara 1.60.1 back, 162 s into its trial).
                    if (child.ExitCode != PlannedRestart) try { spec.AfterExit?.Invoke(exe, DateTime.UtcNow - started); } catch (Exception e) { Set("after-exit check failed: " + e.Message); }
                // Let the readers finish the tail of the output before the writer goes away. Without this the
                // dispose races them, which is the leak that started all of the above.
                try { await Task.WhenAll(pipes).WaitAsync(TimeSpan.FromSeconds(5)); } catch { /* a slow tail must not block the restart */ }
                writer?.Dispose();

                // A planned restart for an update (exit code 75, 2026-10-14): straight back up, no pause, not a crash.
                if (child.ExitCode == PlannedRestart) { pause = TimeSpan.FromMilliseconds(150); Set($"{spec.Name} restarting for an update"); goto Again; }

                // Stop rather than loop forever. Without this, a Core that cannot stay up is invisible:
                // the pet sits there looking perfectly normal while nothing behind it works, which is the
                // same silent-failure shape as the write that died for six days.
                if (TooManyDeaths(DateTime.UtcNow))
                {
                    GivenUp = true;
                    var ran = (int)(DateTime.UtcNow - started).TotalSeconds;
                    Set($"gave up after {BurstLimit} crashes in {BurstWindow.TotalMinutes:0} minutes");
                    GaveUp?.Invoke($"{spec.GiveUpSays}, {BurstLimit} times in the last {BurstWindow.TotalMinutes:0} minutes, " +
                                   $"the last one after {ran} second{(ran == 1 ? "" : "s")}. I have stopped trying so it does not loop forever. " +
                                   $"Restart me once you have had a look at {spec.LogFile}.");
                    return;
                }

                pause = DateTime.UtcNow - started > TimeSpan.FromMinutes(1) ? TimeSpan.FromSeconds(2) : TimeSpan.FromSeconds(Math.Min(30, pause.TotalSeconds * 2));
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) { Set("supervisor error: " + e.Message); }
            Again:
            try { await Task.Delay(pause, cts.Token); } catch (OperationCanceledException) { break; }
        }
    }
    /// <summary>The exit code the Shell uses for a planned restart (an update), mirrored in src/Shell/src/main.ts.</summary>
    const int PlannedRestart = 75;

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

    /// <summary>
    /// Phase 2 (2026-11-12, his words: "i want samara as its own standalone browser that i use forever"): Samara runs as
    /// its own program (src/samara.ts, samara.pid) and the Shell (main.ts) is Aang's windows only. P1 (2026-11-17): one
    /// saved setting, samara-mode.json beside body.json ({"apart": true}), on unless it says {"apart": false} (the way back
    /// to the old setup). Only when the Samara code that would run has samara.ts: the releases before P1 do not, and
    /// starting a file that is not there would leave him with no browser. The pet decides and hands its answer to every
    /// Shell and Samara it starts (AANG_SAMARA_APART=1/0, which main.ts follows), so a newer Samara release never goes
    /// apart under an older pet, or the other way round. AANG_SAMARA_APART set on the pet itself wins (the tests).
    /// </summary>
    public static bool SamaraApart => ApartFor(PickSamaraDir(Config.Load().ShellDir));

    /// <summary>Apart, for Samara's code in this folder.</summary>
    internal static bool ApartFor(string? samaraDir) =>
        ApartFrom(Environment.GetEnvironmentVariable("AANG_SAMARA_APART"), Paths.File("samara-mode.json"), samaraDir);

    /// <summary>The folder Samara's code runs from: the installed release the pointer names, else the code folder.</summary>
    internal static string? PickSamaraDir(string? shellDirOverride) =>
        SamaraPointer.Pick(SamaraPointer.DefaultRoot) ?? (shellDirOverride is { Length: > 0 } ? shellDirOverride : FindShellDir());

    internal static bool ApartFrom(string? env, string modeFile, string? samaraDir)
    {
        if (env == "1") return true;
        if (env == "0") return false;
        if (samaraDir == null || !File.Exists(Path.Combine(samaraDir, "src", "samara.ts"))) return false;
        try
        {
            if (File.Exists(modeFile))
            {
                using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(modeFile));
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object && doc.RootElement.TryGetProperty("apart", out var a)
                    && a.ValueKind is System.Text.Json.JsonValueKind.True or System.Text.Json.JsonValueKind.False) return a.GetBoolean();
            }
        }
        catch { /* unreadable: the default */ }
        return true;
    }

    /// <summary>The browser that is running right now: Samara's own program when apart, else the Shell that holds it.</summary>
    public static Process? RunningBrowser() => SamaraApart ? RunningFrom("samara.pid") : RunningShell();

    /// <summary>A Shell that is running right now, from the pid it keeps in shell.pid (only if it really is Electron).</summary>
    public static Process? RunningShell() => RunningFrom("shell.pid");

    static Process? RunningFrom(string pidFile)
    {
        try
        {
            if (!int.TryParse(File.ReadAllText(Paths.File(pidFile)).Trim(), out var pid)) return null;
            var p = Process.GetProcessById(pid);
            if (!p.HasExited && p.ProcessName.Contains("electron", StringComparison.OrdinalIgnoreCase)) return p;
            p.Dispose();
        }
        catch { /* none */ }
        return null;
    }

    /// <summary>
    /// Aang's own tools (his rule, 2026-11-18: "the mini player the notes ... the timer ... are supposed to be seperate ...
    /// their own things that control their own pieces"): the music player, a new note, a timer. `Aang.exe --open &lt;tool&gt;`
    /// reaches them straight in Aang's windows, never through Samara (a dock or a list that went through Samara opened
    /// Samara instead, and nothing else, on 2026-11-18).
    /// </summary>
    public static readonly string[] Tools = { "player", "new-note", "timer" };
    /// <summary>The tool `--open &lt;tool&gt;` names, or null (anything not on the list is ignored).</summary>
    public static string? ToolFrom(string[] args)
    {
        var i = Array.IndexOf(args, "--open");
        return i >= 0 && i + 1 < args.Length && Array.IndexOf(Tools, args[i + 1]) >= 0 ? args[i + 1] : null;
    }
    /// <summary>Extra switches for the next start of an independent Shell only (a tool asked for as Aang starts).</summary>
    public string? NextExtra { get; set; }

    /// <summary>
    /// A tool for Aang's windows that are already running: a second copy of the Shell, told the same Samara-apart answer
    /// the pet gives its own (so it lands in Aang's profile, not Samara's), hands the tool over and steps aside.
    /// </summary>
    public static bool OpenTool(string? shellDirOverride, string tool)
    {
        if (Array.IndexOf(Tools, tool) < 0) return false;
        using var sup = ForShell(shellDirOverride);
        var s = sup.spec;
        if (s.Dir == null || s.Exe == null || !File.Exists(s.Exe)) { Log.Write("tool: the Shell was not found, so " + tool + " did not open"); return false; }
        try
        {
            var exe = s.PickExe?.Invoke(s.Exe) ?? s.Exe;
            var dir = s.PickDir?.Invoke() ?? s.Dir;
            var psi = new ProcessStartInfo(exe, s.Args + " --samara-task=" + tool) { WorkingDirectory = dir, UseShellExecute = false, CreateNoWindow = true };
            if (s.PickDir != null) psi.Environment["AANG_SHELL_HOME"] = s.Dir;
            psi.Environment["AANG_SAMARA_APART"] = ApartFor(dir) ? "1" : "0";
            using var p = Process.Start(psi);
            Log.Write($"tool: {tool} handed to Aang's windows (pid {p?.Id})");
            return p != null;
        }
        catch (Exception e) { Log.Write("tool: could not open " + tool + ": " + e.Message); return false; }
    }

    /// <summary>Samara alone (his ask, 2026-10-20): start the Shell with no pet and no brain, on the engine it would use.</summary>
    /// <remarks>
    /// P1 (2026-11-17): when a trial engine or a trial Samara release is being run, this waits (up to the trial's grace,
    /// three minutes) so one that dies early is still rolled back, as the supervisor does for the Shell it starts. With
    /// nothing on trial it returns at once. quiet: Samara starts with only its doors, no window (Aang starting up, or
    /// Claude's connector).
    /// </remarks>
    public static bool StartShellAlone(string? shellDirOverride, bool quiet = false)
    {
        using var sup = ForShell(shellDirOverride);
        var s = sup.spec;
        if (s.Dir == null || s.Exe == null || !File.Exists(s.Exe)) { Log.Write("samara: the Shell was not found, so it was not opened"); return false; }
        Process? p;
        string exe;
        var started = DateTime.UtcNow;
        try
        {
            exe = s.PickExe?.Invoke(s.Exe) ?? s.Exe;
            var dir = s.PickDir?.Invoke() ?? s.Dir;
            var apart = ApartFor(dir);
            var args = apart ? "src/samara.ts" + (quiet ? " --quiet" : "") : s.Args;
            var psi = new ProcessStartInfo(exe, args) { WorkingDirectory = dir, UseShellExecute = false, CreateNoWindow = true };
            if (s.PickDir != null) psi.Environment["AANG_SHELL_HOME"] = s.Dir;
            psi.Environment["AANG_SAMARA_APART"] = apart ? "1" : "0";
            p = Process.Start(psi);
            Log.Write($"samara: opened on its own (pid {p?.Id})");
            if (p == null) return false;
        }
        catch (Exception e) { Log.Write("samara: could not open: " + e.Message); return false; }
        using (p) WatchTrial(p, OnTrial(s.Dir), exe, started, s.AfterExit);
        return true;
    }

    /// <summary>
    /// A release on trial (the engine's or Samara's own) that dies within its grace is rolled back by AfterExit. Waits only
    /// while something is on trial and only for the grace, so this launcher never lingers (it would lock Aang.exe).
    /// </summary>
    internal static bool WatchTrial(Process p, bool onTrial, string exe, DateTime started, Action<string, TimeSpan>? afterExit, TimeSpan? graceOverride = null)
    {
        if (afterExit == null || !onTrial) return false;
        var grace = graceOverride ?? (EnginePointer.TrialGrace > SamaraPointer.TrialGrace ? EnginePointer.TrialGrace : SamaraPointer.TrialGrace);
        try
        {
            if (!p.WaitForExit(grace)) return false;    // past its grace: it is good (it marks itself so)
            Log.Write($"samara: exited with code {p.ExitCode} after {(int)(DateTime.UtcNow - started).TotalSeconds} s, on trial");
            // A planned restart (an update going in) is not the trial failing.
            if (p.ExitCode == PlannedRestart) return false;
            afterExit(exe, DateTime.UtcNow - started);
            return true;
        }
        catch (Exception e) { Log.Write("samara: trial watch failed: " + e.Message); return false; }
    }

    static bool OnTrial(string shellDir) =>
        EnginePointer.Read(shellDir)?.status == "trial" || SamaraPointer.Read(SamaraPointer.DefaultRoot)?.status == "trial";

    public void Dispose()
    {
        cts.Cancel();
        if (spec.Independent) { if (job != IntPtr.Zero) Win32.CloseHandle(job); return; }   // Samara stays; it decides for itself
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
