// THROWAWAY: WebView2 host used ONLY to measure the engine Tauri v2 runs on (Tauri needs Rust + MSVC,
// neither installed). Opaque window, so hit-test results are not meaningful here - only RAM/CPU are.
using Microsoft.Web.WebView2.WinForms;
using System.Drawing;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main() { ApplicationConfiguration.Initialize(); Application.Run(new Host()); }
}

sealed class Host : Form
{
    readonly WebView2 wv = new() { Dock = DockStyle.Fill };
    public Host()
    {
        Text = "AangSpike"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual;
        Location = new Point(1430, 740); Size = new Size(470, 310); ShowInTaskbar = false; TopMost = true;
        Controls.Add(wv);
        Load += async (_, _) =>
        {
            var ud = Path.Combine(Path.GetTempPath(), "aang_wv2_spike");
            var env = await Microsoft.Web.WebView2.Core.CoreWebView2Environment.CreateAsync(null, ud);
            await wv.EnsureCoreWebView2Async(env);
            wv.CoreWebView2.NavigateToString(Html(int.TryParse(Environment.GetEnvironmentVariable("SPIKE_FPS"), out var f) ? f : 30));
        };
    }
    protected override bool ShowWithoutActivation => true;

    static string Html(int fps) => @"<!doctype html><html><body style='margin:0;background:#0d0a1e;overflow:hidden'>
<canvas id=c width=470 height=310></canvas><script>
const c=document.getElementById('c'),g=c.getContext('2d');let t=0,last=0;const STEP=1000/" + fps + @"-2;
function draw(now){requestAnimationFrame(draw);if(now-last<STEP)return;last=now;t++;
g.clearRect(0,0,470,310);g.fillStyle='rgba(13,10,30,.94)';g.strokeStyle='#e8a33a';g.lineWidth=2;
g.beginPath();g.roundRect(5,5,257,120,12);g.fill();g.stroke();g.fillStyle='#fff';g.font='14px sans-serif';
g.fillText('spike bubble '+(t%100),20,40);const bob=Math.round(Math.sin(t/8)*3);
g.fillStyle='#e9c9a8';g.fillRect(338,160+bob,44,44);g.fillStyle='#e8b93a';g.fillRect(330,204+bob,60,66);
g.fillStyle='#7a4b9a';g.fillRect(326,272,68,10);}
requestAnimationFrame(draw);</script></body></html>";
}
