using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace Aang.Body;

/// <summary>
/// WebSocket client to the Core. It reconnects forever and never blocks the UI thread: every callback
/// arrives from a background task and the window marshals it onto its own thread. If the Core is down the
/// pet keeps working on its own.
/// </summary>
sealed class CoreLink : IDisposable
{
    readonly Uri uri;
    readonly CancellationTokenSource cts = new();
    ClientWebSocket? ws;

    public event Action<JsonElement>? Message;
    public event Action<bool>? ConnectionChanged;
    public bool IsConnected { get; private set; }

    public CoreLink(Uri uri) => this.uri = uri;

    public void Start() => _ = Task.Run(RunAsync);

    async Task RunAsync()
    {
        while (!cts.IsCancellationRequested)
        {
            try
            {
                ws = new ClientWebSocket();
                await ws.ConnectAsync(uri, cts.Token);
                SetConnected(true);
                await SendAsync(new { t = "hello", v = 1, pid = Environment.ProcessId });
                await ReceiveLoopAsync(ws);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e) when (e is WebSocketException or HttpRequestException or IOException or InvalidOperationException) { /* Core not up yet */ }
            catch (Exception e) { Log.Write("link error: " + e.Message); }
            finally { SetConnected(false); ws?.Dispose(); ws = null; }

            try { await Task.Delay(1500, cts.Token); } catch (OperationCanceledException) { break; }
        }
    }

    async Task ReceiveLoopAsync(ClientWebSocket socket)
    {
        var buf = new byte[16 * 1024];
        using var acc = new MemoryStream();
        while (socket.State == WebSocketState.Open && !cts.IsCancellationRequested)
        {
            var r = await socket.ReceiveAsync(buf, cts.Token);
            if (r.MessageType == WebSocketMessageType.Close) return;
            acc.Write(buf, 0, r.Count);
            if (!r.EndOfMessage) continue;
            try
            {
                using var doc = JsonDocument.Parse(acc.ToArray());
                Message?.Invoke(doc.RootElement.Clone());
            }
            catch (JsonException e) { Log.Write("bad message: " + e.Message); }
            acc.SetLength(0);
        }
    }

    void SetConnected(bool v)
    {
        if (IsConnected == v) return;
        IsConnected = v;
        Log.Write(v ? "core connected" : "core disconnected");
        ConnectionChanged?.Invoke(v);
    }

    public async Task SendAsync(object payload)
    {
        var socket = ws;
        if (socket is not { State: WebSocketState.Open }) return;
        try
        {
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload));
            await socket.SendAsync(bytes, WebSocketMessageType.Text, true, cts.Token);
        }
        catch (Exception e) { Log.Write("send failed: " + e.Message); }
    }

    public void Dispose() { cts.Cancel(); ws?.Dispose(); }
}
