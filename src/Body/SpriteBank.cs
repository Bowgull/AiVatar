using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace Aang.Body;

/// <summary>
/// Loads the pre-rendered frames (`idle_0.png`, `idle_1.png`, ...) on first use and keeps them as
/// premultiplied bitmaps so each blit is a straight copy. A state's frames are only decoded when that
/// state is first played, which keeps the resident set small.
/// </summary>
sealed class SpriteBank : IDisposable
{
    readonly string dir;
    readonly Dictionary<string, Bitmap[]> cache = new();

    public SpriteBank(string dir) => this.dir = dir;

    public bool HasAssets => File.Exists(Path.Combine(dir, "idle_0.png"));

    public int Count(string state) => Frames(state).Length;

    public Bitmap Frame(string state, int index)
    {
        var f = Frames(state);
        return f[((index % f.Length) + f.Length) % f.Length];
    }

    Bitmap[] Frames(string state)
    {
        if (cache.TryGetValue(state, out var hit)) return hit;

        var list = new List<Bitmap>();
        for (int i = 0; ; i++)
        {
            var path = Path.Combine(dir, $"{state}_{i}.png");
            if (!File.Exists(path)) break;
            using var src = new Bitmap(path);
            var pa = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppPArgb);
            using (var g = Graphics.FromImage(pa))
            {
                g.CompositingMode = CompositingMode.SourceCopy;
                g.DrawImage(src, 0, 0, src.Width, src.Height);
            }
            list.Add(pa);
        }

        if (list.Count == 0)
        {
            if (state == "idle") throw new FileNotFoundException($"No sprite frames found in {dir}");
            return Frames("idle");
        }
        return cache[state] = list.ToArray();
    }

    public void Dispose()
    {
        foreach (var frames in cache.Values) foreach (var b in frames) b.Dispose();
        cache.Clear();
    }
}
