using System.Text.Json;

namespace Aang.Body;

/// <summary>
/// Recall of earlier messages with Up and Down, like a shell. Whatever was half-typed is kept as a draft and
/// comes back when Down walks past the newest entry. Persisted so history survives a restart.
/// </summary>
sealed class InputHistory
{
    const int Max = 50;
    readonly List<string> items = new();
    readonly string? file;
    int index;
    string draft = "";

    public IReadOnlyList<string> Items => items;
    public bool Browsing => index < items.Count;

    public InputHistory(string? file = null)
    {
        this.file = file;
        try
        {
            if (file != null && File.Exists(file))
                items.AddRange(JsonSerializer.Deserialize<List<string>>(File.ReadAllText(file)) ?? new());
        }
        catch (Exception e) { Log.Write("history load failed: " + e.Message); }
        index = items.Count;
    }

    public void Add(string text)
    {
        text = text.Trim();
        if (text.Length == 0) return;
        if (items.Count == 0 || items[^1] != text) items.Add(text);
        while (items.Count > Max) items.RemoveAt(0);
        Reset();
        try { if (file != null) Atomic.Write(file, JsonSerializer.Serialize(items)); }
        catch (Exception e) { Log.Write("history save failed: " + e.Message); }
    }

    /// <summary>Up: the previous message, or null if there is nothing older. <paramref name="current"/> is kept as the draft.</summary>
    public string? Prev(string current)
    {
        if (items.Count == 0) return null;
        if (index >= items.Count) draft = current;
        if (index > 0) index--;
        return items[index];
    }

    /// <summary>Down: the next message, then the draft. Null when not browsing.</summary>
    public string? Next()
    {
        if (index >= items.Count) return null;
        index++;
        return index >= items.Count ? draft : items[index];
    }

    public void Reset() { index = items.Count; draft = ""; }
}
