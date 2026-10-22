using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Aang.Body;

/// <summary>
/// Spotify's own slider in the Windows volume mixer (CoreAudio's ISimpleAudioVolume on its audio session): the
/// player's volume with no Premium, no quota and no network. Spotify runs several processes, so every session that
/// belongs to a Spotify.exe is read and set together. Called off the UI thread; CoreAudio's objects are free-threaded.
/// </summary>
static class SpotifyVolume
{
    /// <summary>0..1, or null when Spotify has no audio session on the default output.</summary>
    public static double? Get()
    {
        try { foreach (var v in Sessions()) { using (v) { Check(v.Value.GetMasterVolume(out var level)); return level; } } }
        catch (Exception e) when (e is COMException or InvalidCastException) { Log.Write("spotify volume read failed: " + e.Message); }
        return null;
    }

    public static bool Set(float level)
    {
        level = Math.Clamp(level, 0f, 1f);
        bool any = false;
        try
        {
            var ctx = Guid.Empty;
            foreach (var v in Sessions()) using (v) { Check(v.Value.SetMasterVolume(level, ref ctx)); any = true; }
        }
        catch (Exception e) when (e is COMException or InvalidCastException) { Log.Write("spotify volume set failed: " + e.Message); }
        return any;
    }

    /// <summary>A COM object released as soon as it is used, so the mixer is not held between reads.</summary>
    readonly struct Owned<T>(T value) : IDisposable where T : class
    {
        public T Value { get; } = value;
        public void Dispose() { if (Value is not null && Marshal.IsComObject(Value)) Marshal.ReleaseComObject(Value); }
    }

    static IEnumerable<Owned<ISimpleAudioVolume>> Sessions()
    {
        var spotifyPids = new HashSet<uint>();
        foreach (var p in Process.GetProcessesByName("Spotify")) using (p) spotifyPids.Add((uint)p.Id);
        if (spotifyPids.Count == 0) yield break;

        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
        IMMDevice? device = null; IAudioSessionManager2? mgr = null; IAudioSessionEnumerator? list = null;
        try
        {
            if (enumerator.GetDefaultAudioEndpoint(0 /* eRender */, 1 /* eMultimedia */, out device) != 0 || device is null) yield break;
            var iid = typeof(IAudioSessionManager2).GUID;
            if (device.Activate(ref iid, 0x17 /* CLSCTX_ALL */, IntPtr.Zero, out var o) != 0) yield break;
            mgr = (IAudioSessionManager2)o;
            if (mgr.GetSessionEnumerator(out list) != 0 || list is null) yield break;
            Check(list.GetCount(out var n));
            for (int i = 0; i < n; i++)
            {
                if (list.GetSession(i, out var ctl) != 0 || ctl is null) continue;
                var c2 = (IAudioSessionControl2)ctl;
                if (c2.GetProcessId(out var pid) == 0 && spotifyPids.Contains(pid)) yield return new((ISimpleAudioVolume)ctl);
                else Marshal.ReleaseComObject(ctl);
            }
        }
        finally
        {
            if (list is not null) Marshal.ReleaseComObject(list);
            if (mgr is not null) Marshal.ReleaseComObject(mgr);
            if (device is not null) Marshal.ReleaseComObject(device);
            Marshal.ReleaseComObject(enumerator);
        }
    }

    static void Check(int hr) { if (hr < 0) Marshal.ThrowExceptionForHR(hr); }

    // ---- CoreAudio, only the methods used, in vtable order ----

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        // IAudioSessionManager
        [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
        // IAudioSessionManager2
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator list);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        // IAudioSessionControl
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out IntPtr name);
        [PreserveSig] int SetDisplayName(IntPtr name, IntPtr ctx);
        [PreserveSig] int GetIconPath(out IntPtr path);
        [PreserveSig] int SetIconPath(IntPtr path, IntPtr ctx);
        [PreserveSig] int GetGroupingParam(out Guid param);
        [PreserveSig] int SetGroupingParam(IntPtr param, IntPtr ctx);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
        // IAudioSessionControl2
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out uint pid);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, ref Guid eventContext);
        [PreserveSig] int GetMasterVolume(out float level);
    }
}
