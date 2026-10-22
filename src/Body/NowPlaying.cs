using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Windows.Media.Control;

namespace Aang.Body;

/// <summary>
/// What is playing on this PC, for the Spotify mini player (docs/POPOUTS-NOTES-RESEARCH.md section 4). Windows' own
/// now-playing feed (SMTC) gives the song, the cover, the timeline and the buttons, pushed, with no Spotify quota and no
/// network; Spotify's volume comes from its own slider in the Windows mixer. The brain keeps the latest `media.now` and
/// passes it to the Shell; the player's buttons come back as `media.cmd`. No drawing here: the player is a later step.
/// </summary>
sealed class NowPlaying : IDisposable
{
    readonly IMediaSource source;
    readonly Func<object, Task> send;
    readonly NowPlayingFeed feed = new();
    readonly SemaphoreSlim gate = new(1, 1);
    readonly System.Threading.Timer flush;
    bool disposed;

    public NowPlaying(IMediaSource source, Func<object, Task> send)
    {
        this.source = source; this.send = send;
        flush = new System.Threading.Timer(_ => _ = FlushAsync(), null, Timeout.Infinite, Timeout.Infinite);
        source.Changed += () => _ = RefreshAsync();
    }

    public void Start() => _ = Task.Run(async () =>
    {
        try { await source.StartAsync(); await RefreshAsync(); }
        catch (Exception e) { Log.Write("now playing unavailable: " + e.Message); }
    });

    /// <summary>After a reconnect: forget what was sent, so the brain gets the whole picture again, cover included.</summary>
    public void Resend() { lock (feed) feed.Reset(); _ = RefreshAsync(); }

    public async Task CommandAsync(JsonElement m)
    {
        var c = MediaCommand.Parse(m);
        if (c is null) { Log.Write("media.cmd refused"); return; }
        try { if (!await source.RunAsync(c)) Log.Write($"media.cmd {c.Op} did nothing"); }
        catch (Exception e) { Log.Write("media.cmd failed: " + e.Message); }
        await RefreshAsync();     // the volume is not evented, and the rest is sooner this way
    }

    async Task RefreshAsync()
    {
        if (disposed) return;
        await gate.WaitAsync();
        try
        {
            MediaSnapshot? snap;
            try { snap = await source.ReadAsync(); }
            catch (Exception e) { Log.Write("now playing read failed: " + e.Message); return; }
            await Emit(f => f.Offer(snap, Now()));
        }
        finally { gate.Release(); }
    }

    async Task FlushAsync()
    {
        if (disposed) return;
        await gate.WaitAsync();
        try { await Emit(f => f.Flush(Now())); }
        finally { gate.Release(); }
    }

    async Task Emit(Func<NowPlayingFeed, Dictionary<string, object?>?> step)
    {
        Dictionary<string, object?>? msg; long due;
        lock (feed) { msg = step(feed); due = feed.FlushDueIn(Now()); }
        if (!disposed) flush.Change(due < 0 ? Timeout.Infinite : Math.Max(due, 1), Timeout.Infinite);
        if (msg != null) await send(msg);
    }

    static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public void Dispose() { disposed = true; flush.Dispose(); source.Dispose(); }
}

/// <summary>One read of what is playing. `Thumb` is the cover as a PNG data URL, or null for none.</summary>
sealed record MediaSnapshot(
    string App, bool Spotify, string Title, string Artist, string Album, string Status,
    double Position, double Duration, long At, bool CanSeek, double? Volume, string? Thumb);

sealed record MediaCommand(string Op, double Value)
{
    static readonly HashSet<string> Plain = ["play", "pause", "toggle", "next", "prev"];

    /// <summary>The brain checks these strictly (media.ts); this checks again, as strictly, because it is the side that acts.</summary>
    public static MediaCommand? Parse(JsonElement m)
    {
        if (m.ValueKind != JsonValueKind.Object) return null;
        if (!m.TryGetProperty("t", out var t) || t.ValueKind != JsonValueKind.String || t.GetString() != "media.cmd") return null;
        if (!m.TryGetProperty("op", out var o) || o.ValueKind != JsonValueKind.String) return null;
        var op = o.GetString()!;
        var keys = m.EnumerateObject().Select(p => p.Name).ToHashSet();
        if (Plain.Contains(op)) return keys.SetEquals(["t", "op"]) ? new(op, 0) : null;
        var field = op switch { "seek" => "position", "volume" => "volume", _ => null };
        if (field is null || !keys.SetEquals(["t", "op", field])) return null;
        if (m.GetProperty(field) is not { ValueKind: JsonValueKind.Number } n || !n.TryGetDouble(out var v) || !double.IsFinite(v)) return null;
        if (op == "seek" && v is >= 0 and <= 24 * 3600) return new(op, v);
        if (op == "volume" && v is >= 0 and <= 1) return new(op, v);
        return null;
    }
}

/// <summary>Where the feed comes from. The real one is Windows (SmtcSource); tests use a fake.</summary>
interface IMediaSource : IDisposable
{
    event Action? Changed;
    Task StartAsync();
    Task<MediaSnapshot?> ReadAsync();
    Task<bool> RunAsync(MediaCommand c);
}

/// <summary>
/// The pure part: what to send, and when. Anything but the position goes out at once; a position-only change at most
/// once a second, and not at all when it is where the player would have drawn it anyway (it adds the time since `at`).
/// The cover is sent only when it changes.
/// </summary>
sealed class NowPlayingFeed
{
    public const long PositionEveryMs = 1000;
    /// <summary>How far the reported position may drift from the player's own guess before it is worth correcting.</summary>
    public const double DriftSec = 0.75;

    MediaSnapshot? sent;
    bool sentNone, anySent;
    string? sentThumbHash;
    long sentAt = long.MinValue / 2;
    MediaSnapshot? pending;

    public void Reset() { sent = null; sentNone = false; anySent = false; sentThumbHash = null; sentAt = long.MinValue / 2; pending = null; }

    public Dictionary<string, object?>? Offer(MediaSnapshot? snap, long now)
    {
        if (snap is null)
        {
            pending = null;
            if (anySent && sentNone) return null;
            sent = null; sentNone = true; anySent = true; sentThumbHash = null; sentAt = now;
            return new() { ["t"] = "media.now", ["v"] = 1, ["app"] = null };
        }
        var hash = Hash(snap.Thumb);
        bool thumbChanged = !anySent || sentNone || hash != sentThumbHash;
        if (sent is null || thumbChanged || !SameApartFromTime(sent, snap)) return Build(snap, hash, thumbChanged, now);
        if (!Drifted(sent, snap)) { pending = null; return null; }
        if (now - sentAt >= PositionEveryMs) return Build(snap, hash, false, now);
        pending = snap; return null;
    }

    public Dictionary<string, object?>? Flush(long now)
    {
        if (pending is null || now - sentAt < PositionEveryMs) return null;
        var p = pending; return Build(p, Hash(p.Thumb), false, now);
    }

    /// <summary>Milliseconds until a held position may go, or -1 when nothing is held.</summary>
    public long FlushDueIn(long now) => pending is null ? -1 : Math.Max(0, sentAt + PositionEveryMs - now);

    Dictionary<string, object?> Build(MediaSnapshot s, string? hash, bool withThumb, long now)
    {
        sent = s; sentNone = false; anySent = true; sentAt = now; pending = null;
        var m = new Dictionary<string, object?>
        {
            ["t"] = "media.now", ["v"] = 1, ["app"] = s.App, ["spotify"] = s.Spotify,
            ["title"] = s.Title, ["artist"] = s.Artist, ["album"] = s.Album, ["status"] = s.Status,
            ["position"] = Math.Round(s.Position, 3), ["duration"] = Math.Round(s.Duration, 3), ["at"] = s.At,
            ["canSeek"] = s.CanSeek, ["volume"] = s.Volume is double v ? Math.Round(v, 3) : null,
        };
        if (withThumb) { m["thumb"] = s.Thumb; sentThumbHash = hash; }
        return m;
    }

    static bool SameApartFromTime(MediaSnapshot a, MediaSnapshot b) =>
        a.App == b.App && a.Spotify == b.Spotify && a.Title == b.Title && a.Artist == b.Artist && a.Album == b.Album &&
        a.Status == b.Status && Math.Abs(a.Duration - b.Duration) < 0.5 && a.CanSeek == b.CanSeek &&
        Nullable.Equals(a.Volume is double x ? Math.Round(x, 3) : (double?)null, b.Volume is double y ? Math.Round(y, 3) : (double?)null);

    /// <summary>Is the new position somewhere the player would not have guessed from the last one?</summary>
    static bool Drifted(MediaSnapshot was, MediaSnapshot now)
    {
        var guess = was.Position + (was.Status == "playing" ? (now.At - was.At) / 1000.0 : 0);
        return Math.Abs(guess - now.Position) > DriftSec;
    }

    static string? Hash(string? s) => s is null ? null : Convert.ToHexString(SHA1.HashData(System.Text.Encoding.ASCII.GetBytes(s)));

    // ---- small pure helpers the Windows side uses, here so they can be tested ----

    /// <summary>Spotify's session if there is one, else the one Windows calls current, else the first; -1 for none.</summary>
    public static int Pick(IReadOnlyList<string> appIds, int current)
    {
        for (int i = 0; i < appIds.Count; i++) if (IsSpotify(appIds[i])) return i;
        if (current >= 0 && current < appIds.Count) return current;
        return appIds.Count > 0 ? 0 : -1;
    }

    public static bool IsSpotify(string? appId) => appId != null && appId.Contains("spotify", StringComparison.OrdinalIgnoreCase);

    /// <summary>"Spotify.exe", "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", "Chrome", "MSEdge" -> "spotify", "chrome", "msedge".</summary>
    public static string AppName(string? appId)
    {
        if (string.IsNullOrWhiteSpace(appId)) return "unknown";
        if (IsSpotify(appId)) return "spotify";
        var s = appId;
        var bang = s.LastIndexOf('!'); if (bang >= 0) s = s[(bang + 1)..];
        s = s.Split('\\', '/').Last();
        if (s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) s = s[..^4];
        s = s.Trim().ToLowerInvariant();
        return s.Length == 0 ? "unknown" : s.Length > 40 ? s[..40] : s;
    }

    public static string StatusName(GlobalSystemMediaTransportControlsSessionPlaybackStatus s) => s switch
    {
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => "playing",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => "paused",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped => "stopped",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Changing => "changing",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Opened => "opened",
        _ => "closed",
    };

    /// <summary>A timeline as seconds into the song, the length, and when that was true (unix ms; `now` if the app never said).</summary>
    public static (double pos, double dur, long at) Timeline(TimeSpan start, TimeSpan end, TimeSpan position, DateTimeOffset updated, long now)
    {
        var dur = Math.Max(0, (end - start).TotalSeconds);
        var pos = Math.Max(0, (position - start).TotalSeconds);
        if (dur > 0) pos = Math.Min(pos, dur);
        var at = updated.Year < 2000 ? now : updated.ToUnixTimeMilliseconds();
        return (pos, dur, at);
    }

    /// <summary>The cover, shrunk to `max` px on its longest side (never enlarged), as a PNG data URL. Null if it is not an image.</summary>
    public static string? ThumbDataUrl(Stream image, int max = 300)
    {
        try
        {
            using var src = Image.FromStream(image, useEmbeddedColorManagement: false, validateImageData: true);
            double k = Math.Min(1.0, (double)max / Math.Max(src.Width, src.Height));
            int w = Math.Max(1, (int)Math.Round(src.Width * k)), h = Math.Max(1, (int)Math.Round(src.Height * k));
            using var dst = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(src, new Rectangle(0, 0, w, h));
            }
            using var ms = new MemoryStream();
            dst.Save(ms, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
        }
        catch (Exception e) when (e is ArgumentException or ExternalException or OutOfMemoryException) { return null; }
    }
}

/// <summary>The real feed: Windows' GlobalSystemMediaTransportControlsSessionManager, plus Spotify's mixer slider.</summary>
sealed class SmtcSource : IMediaSource
{
    public event Action? Changed;
    GlobalSystemMediaTransportControlsSessionManager? manager;
    GlobalSystemMediaTransportControlsSession? session;
    readonly object sync = new();
    /// <summary>The cover is read again only when the song's details change, not on every play/pause or tick.</summary>
    bool coverDirty = true;
    string? cover;

    public async Task StartAsync()
    {
        manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        manager.SessionsChanged += (_, _) => Rebind();
        manager.CurrentSessionChanged += (_, _) => Rebind();
        Rebind();
    }

    void Rebind()
    {
        var m = manager; if (m is null) return;
        GlobalSystemMediaTransportControlsSession? next;
        try
        {
            var all = m.GetSessions().ToList();
            var current = m.GetCurrentSession();
            var i = NowPlayingFeed.Pick(all.Select(s => s.SourceAppUserModelId ?? "").ToList(),
                current is null ? -1 : all.FindIndex(s => s.SourceAppUserModelId == current.SourceAppUserModelId));
            next = i >= 0 ? all[i] : null;
        }
        catch (Exception e) { Log.Write("now playing sessions failed: " + e.Message); return; }
        lock (sync)
        {
            if (session?.SourceAppUserModelId == next?.SourceAppUserModelId && session is not null) return;
            if (session is not null)
            {
                session.MediaPropertiesChanged -= OnProps;
                session.PlaybackInfoChanged -= OnOther;
                session.TimelinePropertiesChanged -= OnOther;
            }
            session = next; coverDirty = true; cover = null;
            if (session is not null)
            {
                session.MediaPropertiesChanged += OnProps;
                session.PlaybackInfoChanged += OnOther;
                session.TimelinePropertiesChanged += OnOther;
            }
        }
        Changed?.Invoke();
    }

    void OnProps(GlobalSystemMediaTransportControlsSession s, MediaPropertiesChangedEventArgs e) { coverDirty = true; Changed?.Invoke(); }
    void OnOther<T>(GlobalSystemMediaTransportControlsSession s, T e) => Changed?.Invoke();

    public async Task<MediaSnapshot?> ReadAsync()
    {
        GlobalSystemMediaTransportControlsSession? s; lock (sync) s = session;
        if (s is null) return null;
        var props = await s.TryGetMediaPropertiesAsync();
        var pb = s.GetPlaybackInfo();
        var tl = s.GetTimelineProperties();
        var id = s.SourceAppUserModelId ?? "";
        if (coverDirty)
        {
            coverDirty = false;
            cover = null;
            if (props?.Thumbnail is { } th)
            {
                try
                {
                    using var ras = await th.OpenReadAsync();
                    using var stream = ras.AsStreamForRead();
                    cover = NowPlayingFeed.ThumbDataUrl(stream);
                }
                catch (Exception e) { Log.Write("cover read failed: " + e.Message); }
            }
            // Spotify often names the song a moment before the cover arrives; the cover's own change event re-reads it.
        }
        var (pos, dur, at) = NowPlayingFeed.Timeline(tl.StartTime, tl.EndTime, tl.Position, tl.LastUpdatedTime, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        var spotify = NowPlayingFeed.IsSpotify(id);
        return new MediaSnapshot(
            NowPlayingFeed.AppName(id), spotify,
            Clip(props?.Title), Clip(props?.Artist), Clip(props?.AlbumTitle),
            NowPlayingFeed.StatusName(pb.PlaybackStatus), pos, dur, at,
            pb.Controls.IsPlaybackPositionEnabled,
            spotify ? await Task.Run(SpotifyVolume.Get) : null,
            cover);
    }

    static string Clip(string? s) => s is null ? "" : s.Length > 300 ? s[..300] : s;

    public async Task<bool> RunAsync(MediaCommand c)
    {
        if (c.Op == "volume") return await Task.Run(() => SpotifyVolume.Set((float)c.Value));
        GlobalSystemMediaTransportControlsSession? s; lock (sync) s = session;
        if (s is null) return false;
        switch (c.Op)
        {
            case "play": return await s.TryPlayAsync();
            case "pause": return await s.TryPauseAsync();
            case "toggle": return await s.TryTogglePlayPauseAsync();
            case "next": return await s.TrySkipNextAsync();
            case "prev": return await s.TrySkipPreviousAsync();
            case "seek":
                var tl = s.GetTimelineProperties();
                var target = tl.StartTime + TimeSpan.FromSeconds(c.Value);
                if (target > tl.EndTime && tl.EndTime > tl.StartTime) target = tl.EndTime;
                return await s.TryChangePlaybackPositionAsync(target.Ticks);
            default: return false;
        }
    }

    public void Dispose()
    {
        lock (sync)
        {
            if (session is not null)
            {
                session.MediaPropertiesChanged -= OnProps;
                session.PlaybackInfoChanged -= OnOther;
                session.TimelinePropertiesChanged -= OnOther;
            }
            session = null; manager = null;
        }
    }
}
