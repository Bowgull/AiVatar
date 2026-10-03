using System.Text.RegularExpressions;

namespace Aang.Body;

/// <summary>
/// The real things mentioned in a message - a file, a link - pulled out so they can be acted on.
/// </summary>
/// <remarks>
/// 4.5, the "entity chips" item. The ROADMAP version had the model emit tags for apps, files, people,
/// times and keys, with a streaming parser and a regex fallback. **This is the fallback, and only the
/// fallback, on purpose.** Model-emitted tags cost tokens on every single reply, and Joshua is at 87% of
/// his week; a regex costs nothing and catches the two kinds that are actually worth a click.
///
/// Files and links only. A chip exists so he can DO something with it - open the file Aang just wrote,
/// open the page it just read. A chip for a date or a person's name is decoration: nothing happens when
/// you press it, and a button that does nothing teaches you not to press buttons.
///
/// Capped at three. Board E's rule for the bubble's own rows applies here too - a row of chips under
/// every message is a banner, and a banner nobody can ignore is a banner nobody reads.
/// </remarks>
static class Entities
{
    public sealed record Chip(string Kind, string Label, string Value);

    public const int Max = 3;

    // A Windows path with a drive letter, or a UNC share. Deliberately strict: a loose path pattern
    // matches half of ordinary prose, and a chip on a non-file is worse than no chip.
    static readonly Regex FileRe = new(
        @"(?:[A-Za-z]:\\|\\\\)[^\s""'<>|?*]+\.[A-Za-z0-9]{1,8}",
        RegexOptions.Compiled);

    static readonly Regex LinkRe = new(
        @"https?://[^\s""'<>)\]]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// Up to three things worth a button: files first, then links, NOT in the order they appear in the
    /// sentence. A file Aang just wrote is the thing he is most likely to want, so it should not be pushed
    /// off the end of the row by two links that happened to be mentioned earlier. Never throws on odd input.
    /// </summary>
    public static List<Chip> Find(string text)
    {
        var found = new List<Chip>();
        if (string.IsNullOrEmpty(text)) return found;
        try
        {
            foreach (Match m in FileRe.Matches(text))
            {
                var full = m.Value.TrimEnd('.', ',', ';', ':');
                if (full.Length < 4) continue;
                if (found.Any(c => c.Value == full)) continue;
                found.Add(new Chip("file", Leaf(full), full));
                if (found.Count >= Max) return found;
            }
            foreach (Match m in LinkRe.Matches(text))
            {
                var full = m.Value.TrimEnd('.', ',', ';', ':');
                if (found.Any(c => c.Value == full)) continue;
                found.Add(new Chip("link", Host(full), full));
                if (found.Count >= Max) return found;
            }
        }
        catch { /* a chip is a convenience; never let it break the view it sits in */ }
        return found;
    }

    /// <summary>The file's own name. The full path is the value; nobody reads a path on a button.</summary>
    static string Leaf(string path)
    {
        var cut = path.LastIndexOfAny(new[] { '\\', '/' });
        var name = cut >= 0 && cut < path.Length - 1 ? path[(cut + 1)..] : path;
        return name.Length > 28 ? name[..27] + "…" : name;
    }

    /// <summary>The site, without the scheme or the www. "github.com", not the whole query string.</summary>
    static string Host(string url)
    {
        try
        {
            var h = new Uri(url).Host;
            if (h.StartsWith("www.", StringComparison.OrdinalIgnoreCase)) h = h[4..];
            return h.Length > 28 ? h[..27] + "…" : h;
        }
        catch { return "link"; }
    }
}
