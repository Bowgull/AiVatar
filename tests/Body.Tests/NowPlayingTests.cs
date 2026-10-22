using System.Drawing;
using System.Drawing.Imaging;
using System.Text.Json;
using Aang.Body;
using Windows.Media.Control;
using Xunit;

namespace Body.Tests;

public class NowPlayingTests
{
    static MediaSnapshot Snap(string title = "Song", string status = "playing", double pos = 10, long at = 100_000, string? thumb = "data:image/png;base64,AAA", double? vol = 0.5) =>
        new("spotify", true, title, "Artist", "Album", status, pos, 200, at, true, vol, thumb);

    [Fact] public void First_update_carries_everything_including_the_cover()
    {
        var f = new NowPlayingFeed();
        var m = f.Offer(Snap(), 1000)!;
        Assert.Equal("media.now", m["t"]); Assert.Equal("Song", m["title"]); Assert.Equal("data:image/png;base64,AAA", m["thumb"]);
        Assert.Equal(10.0, m["position"]); Assert.Equal(100_000L, m["at"]); Assert.Equal(0.5, m["volume"]);
    }

    [Fact] public void The_cover_is_sent_only_when_it_changes()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(), 1000);
        var paused = f.Offer(Snap(status: "paused"), 1100)!;
        Assert.False(paused.ContainsKey("thumb"));
        var newSong = f.Offer(Snap(title: "Next", status: "paused", thumb: "data:image/png;base64,BBB"), 1200)!;
        Assert.Equal("data:image/png;base64,BBB", newSong["thumb"]);
        var noCover = f.Offer(Snap(title: "Next", status: "paused", thumb: null), 1300)!;
        Assert.True(noCover.ContainsKey("thumb")); Assert.Null(noCover["thumb"]);
    }

    [Fact] public void Nothing_changed_sends_nothing()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(), 1000);
        Assert.Null(f.Offer(Snap(), 1500));
        Assert.Null(f.Offer(Snap(), 5000));
    }

    [Fact] public void Position_the_player_would_have_guessed_is_not_sent()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(pos: 10, at: 100_000), 1000);
        Assert.Null(f.Offer(Snap(pos: 15, at: 105_000), 9000));        // 5 s later, 5 s further on: interpolation had it
        Assert.Equal(-1, f.FlushDueIn(9000));
    }

    [Fact] public void A_seek_goes_out_at_most_once_a_second_and_the_last_one_is_flushed()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(pos: 10, at: 100_000), 1000);
        Assert.Null(f.Offer(Snap(pos: 80, at: 100_200), 1200));        // within the second: held
        Assert.Null(f.Offer(Snap(pos: 90, at: 100_400), 1400));        // replaces the held one
        Assert.Equal(600, f.FlushDueIn(1400));
        Assert.Null(f.Flush(1900));
        var m = f.Flush(2000)!;
        Assert.Equal(90.0, m["position"]); Assert.False(m.ContainsKey("thumb"));
        Assert.Null(f.Flush(3000));
        var later = f.Offer(Snap(pos: 150, at: 103_000), 3100)!;      // a second has passed: straight out
        Assert.Equal(150.0, later["position"]);
    }

    [Fact] public void Status_and_song_changes_skip_the_throttle()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(), 1000);
        Assert.NotNull(f.Offer(Snap(status: "paused"), 1010));
        Assert.NotNull(f.Offer(Snap(status: "paused", title: "B"), 1020));
        Assert.NotNull(f.Offer(Snap(status: "paused", title: "B", vol: 0.2), 1030));
    }

    [Fact] public void Paused_position_change_is_a_drift()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(status: "paused", pos: 10, at: 100_000), 1000);
        Assert.Null(f.Offer(Snap(status: "paused", pos: 10, at: 200_000), 3000));   // paused: time passing is no change
        Assert.NotNull(f.Offer(Snap(status: "paused", pos: 40, at: 200_000), 4000));
    }

    [Fact] public void No_session_is_said_once_and_reset_resends_all()
    {
        var f = new NowPlayingFeed();
        f.Offer(Snap(), 1000);
        var none = f.Offer(null, 1100)!;
        Assert.Null(none["app"]); Assert.Equal(3, none.Count);
        Assert.Null(f.Offer(null, 1200));
        Assert.Equal("data:image/png;base64,AAA", f.Offer(Snap(), 1300)!["thumb"]);   // back: cover again
        f.Reset();
        Assert.Equal("data:image/png;base64,AAA", f.Offer(Snap(), 1400)!["thumb"]);
    }

    [Fact] public void Spotify_is_preferred_else_the_current_else_the_first()
    {
        Assert.Equal(1, NowPlayingFeed.Pick(["Chrome", "Spotify.exe", "MSEdge"], 2));
        Assert.Equal(0, NowPlayingFeed.Pick(["SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", "Chrome"], 1));
        Assert.Equal(2, NowPlayingFeed.Pick(["Chrome", "Foo", "MSEdge"], 2));
        Assert.Equal(0, NowPlayingFeed.Pick(["Chrome"], -1));
        Assert.Equal(-1, NowPlayingFeed.Pick([], -1));
    }

    [Theory]
    [InlineData("Spotify.exe", "spotify")] [InlineData("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", "spotify")]
    [InlineData("Chrome", "chrome")] [InlineData("MSEdge", "msedge")] [InlineData(@"C:\Program Files\VLC\vlc.exe", "vlc")]
    [InlineData("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic", "microsoft.zunemusic")] [InlineData("", "unknown")] [InlineData(null, "unknown")]
    public void App_names_are_short(string? id, string expected) => Assert.Equal(expected, NowPlayingFeed.AppName(id));

    [Theory]
    [InlineData(GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing, "playing")]
    [InlineData(GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused, "paused")]
    [InlineData(GlobalSystemMediaTransportControlsSessionPlaybackStatus.Stopped, "stopped")]
    [InlineData(GlobalSystemMediaTransportControlsSessionPlaybackStatus.Changing, "changing")]
    [InlineData(GlobalSystemMediaTransportControlsSessionPlaybackStatus.Opened, "opened")]
    [InlineData(GlobalSystemMediaTransportControlsSessionPlaybackStatus.Closed, "closed")]
    public void Statuses_map(GlobalSystemMediaTransportControlsSessionPlaybackStatus s, string expected) => Assert.Equal(expected, NowPlayingFeed.StatusName(s));

    [Fact] public void Timeline_is_relative_to_start_and_dated()
    {
        var upd = DateTimeOffset.FromUnixTimeMilliseconds(1_760_000_000_000);
        var (pos, dur, at) = NowPlayingFeed.Timeline(TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(185), TimeSpan.FromSeconds(65), upd, 42);
        Assert.Equal(60, pos); Assert.Equal(180, dur); Assert.Equal(1_760_000_000_000, at);
        var (p2, _, at2) = NowPlayingFeed.Timeline(TimeSpan.Zero, TimeSpan.FromSeconds(100), TimeSpan.FromSeconds(500), default, 42);
        Assert.Equal(100, p2); Assert.Equal(42, at2);                  // clamped; an app that never dated it gets "now"
    }

    [Fact] public void Cover_is_shrunk_to_300_and_never_enlarged()
    {
        static Stream Png(int w, int h) { var ms = new MemoryStream(); using (var b = new Bitmap(w, h)) b.Save(ms, ImageFormat.Png); ms.Position = 0; return ms; }
        static Size SizeOf(string url) { using var ms = new MemoryStream(Convert.FromBase64String(url["data:image/png;base64,".Length..])); using var i = Image.FromStream(ms); return i.Size; }
        var big = NowPlayingFeed.ThumbDataUrl(Png(640, 480))!;
        Assert.StartsWith("data:image/png;base64,", big);
        Assert.Equal(new Size(300, 225), SizeOf(big));
        Assert.Equal(new Size(64, 64), SizeOf(NowPlayingFeed.ThumbDataUrl(Png(64, 64))!));
        Assert.Null(NowPlayingFeed.ThumbDataUrl(new MemoryStream([1, 2, 3])));
    }

    static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact] public void Commands_are_parsed_strictly()
    {
        Assert.Equal(new MediaCommand("toggle", 0), MediaCommand.Parse(J("""{"t":"media.cmd","op":"toggle"}""")));
        Assert.Equal(new MediaCommand("seek", 61.5), MediaCommand.Parse(J("""{"t":"media.cmd","op":"seek","position":61.5}""")));
        Assert.Equal(new MediaCommand("volume", 1), MediaCommand.Parse(J("""{"t":"media.cmd","op":"volume","volume":1}""")));
        foreach (var bad in new[] {
            """{"t":"media.cmd","op":"stop"}""", """{"t":"media.cmd","op":"next","x":1}""", """{"t":"media.cmd","op":"seek"}""",
            """{"t":"media.cmd","op":"seek","position":"5"}""", """{"t":"media.cmd","op":"seek","position":-1}""",
            """{"t":"media.cmd","op":"volume","volume":1.5}""", """{"t":"media.now","op":"play"}""", """["media.cmd"]""" })
            Assert.Null(MediaCommand.Parse(J(bad)));
    }

    sealed class FakeSource : IMediaSource
    {
        public event Action? Changed;
        public MediaSnapshot? Now;
        public readonly List<MediaCommand> Ran = [];
        public Task StartAsync() => Task.CompletedTask;
        public Task<MediaSnapshot?> ReadAsync() => Task.FromResult(Now);
        public Task<bool> RunAsync(MediaCommand c) { Ran.Add(c); return Task.FromResult(true); }
        public void Fire() => Changed?.Invoke();
        public void Dispose() { }
    }

    [Fact] public async Task The_service_sends_changes_and_runs_only_valid_commands()
    {
        var src = new FakeSource { Now = Snap() };
        var sent = new List<Dictionary<string, object?>>();
        using var np = new NowPlaying(src, m => { lock (sent) sent.Add((Dictionary<string, object?>)m); return Task.CompletedTask; });
        await np.CommandAsync(J("""{"t":"media.cmd","op":"next"}"""));
        await np.CommandAsync(J("""{"t":"media.cmd","op":"next","sneaky":true}"""));
        await np.CommandAsync(J("""{"t":"media.cmd","op":"volume","volume":0.25}"""));
        Assert.Equal([new MediaCommand("next", 0), new MediaCommand("volume", 0.25)], src.Ran);
        lock (sent) { Assert.Single(sent); Assert.Equal("Song", sent[0]["title"]); }   // one full update; the rest were unchanged
    }
}
