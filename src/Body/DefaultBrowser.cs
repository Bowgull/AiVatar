// 6.27 the default browser (his yes, 2026-10-13). Two jobs, both small:
//
// 1. Register Samara with Windows, per user only (HKCU, no admin): StartMenuInternet, its Capabilities with
//    http and https, a ProgID whose command is `Aang.exe --url -- "%1"`, and RegisteredApplications. Then Windows
//    Settings opens on Aang's page for HIM to click "Set default"; Windows does not let an app set itself.
//
// 2. A link arriving from Windows. The known attack: a link crafted to look like a startup switch
//    ("--gpu-launcher=calc.exe" style) smuggles instructions into the browser. So the command puts `--` before
//    "%1", only the ONE argument after `--` is ever read, and it must parse as an absolute http or https address.
//    Anything else is dropped and logged. The address is never passed on as an argument: it is written as a file
//    into the open-urls folder, and the Shell picks it up from there and opens it as a tab.
using Microsoft.Win32;

namespace Aang.Body;

static class DefaultBrowser
{
    const string Key = "AangBrowser";
    const string ProgId = "AangBrowserURL";
    const string Name = "Samara";

    /// <summary>The address handed over by Windows, or null. Only the single argument after "--", http or https.</summary>
    public static string? UrlFrom(string[] args)
    {
        var i = Array.IndexOf(args, "--url");
        if (i < 0) return null;
        var dash = Array.IndexOf(args, "--", i + 1);
        if (dash < 0 || dash != args.Length - 2) return null;      // exactly one argument after "--", nothing more
        var raw = args[dash + 1].Trim();
        if (raw.Length is 0 or > 8192) return null;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var u)) return null;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return null;
        if (string.IsNullOrEmpty(u.Host)) return null;
        return u.AbsoluteUri;
    }

    /// <summary>Leave the address for the Shell. One small file per link; the Shell deletes it once opened.</summary>
    public static void Queue(string url)
    {
        var dir = Path.Combine(Paths.Dir, "open-urls");
        Directory.CreateDirectory(dir);
        var tmp = Path.Combine(dir, $"{DateTime.UtcNow.Ticks}-{Guid.NewGuid():N}.tmp");
        File.WriteAllText(tmp, url);
        File.Move(tmp, Path.ChangeExtension(tmp, ".url"));
    }

    /// <summary>Windows' Start menu entry for the browser itself (no link): just open it.</summary>
    public static void OpenFlag()
    {
        var dir = Path.Combine(Paths.Dir, "open-urls");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "browser.flag"), "");
    }

    /// <summary>Per-user registration. Safe to run again: every value is simply written.</summary>
    public static void Register(string exe)
    {
        var icon = $"\"{exe}\",0";
        var open = $"\"{exe}\" --url -- \"%1\"";
        using (var c = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProgId}"))
        {
            c.SetValue("", $"{Name} link");
            c.SetValue("FriendlyTypeName", $"{Name} link");
            using (var i = c.CreateSubKey("DefaultIcon")) i.SetValue("", icon);
            using (var cmd = c.CreateSubKey(@"shell\open\command")) cmd.SetValue("", open);
        }
        var root = $@"Software\Clients\StartMenuInternet\{Key}";
        using (var r = Registry.CurrentUser.CreateSubKey(root))
        {
            r.SetValue("", Name);
            using (var i = r.CreateSubKey("DefaultIcon")) i.SetValue("", icon);
            using (var cmd = r.CreateSubKey(@"shell\open\command")) cmd.SetValue("", $"\"{exe}\" --open-browser");
            using var cap = r.CreateSubKey("Capabilities");
            cap.SetValue("ApplicationName", Name);
            cap.SetValue("ApplicationDescription", "Aang's own browser");
            cap.SetValue("ApplicationIcon", icon);
            using (var sm = cap.CreateSubKey("StartMenu")) sm.SetValue("StartMenuInternet", Key);
            using var url = cap.CreateSubKey("URLAssociations");
            url.SetValue("http", ProgId);
            url.SetValue("https", ProgId);
        }
        using (var ra = Registry.CurrentUser.CreateSubKey(@"Software\RegisteredApplications"))
            ra.SetValue(Name, $@"{root}\Capabilities");
        Log.Write($"default browser: registered {exe} for http and https (he still chooses it in Settings)");
    }

    /// <summary>Undo everything Register wrote.</summary>
    public static void Unregister()
    {
        try { Registry.CurrentUser.DeleteSubKeyTree($@"Software\Classes\{ProgId}", false); } catch { /* gone */ }
        try { Registry.CurrentUser.DeleteSubKeyTree($@"Software\Clients\StartMenuInternet\{Key}", false); } catch { /* gone */ }
        try { using var ra = Registry.CurrentUser.OpenSubKey(@"Software\RegisteredApplications", true); ra?.DeleteValue(Name, false); } catch { /* gone */ }
        Log.Write("default browser: registration removed");
    }

    /// <summary>Windows' own Default apps page, on Aang's entry, for him to click "Set default".</summary>
    public static void OpenSettings()
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo($"ms-settings:defaultapps?registeredAppUser={Uri.EscapeDataString(Name)}") { UseShellExecute = true }); }
        catch (Exception e) { Log.Write("default browser: could not open Settings: " + e.Message); }
    }
}
