// THROWAWAY measurement spike - decides the window technology, is not the product.
// Same size, position and animation load as the Electron spike so the numbers compare fairly.
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

static class Native
{
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
}

static class Program
{
    [STAThread]
    static void Main()
    {
        int fps = int.TryParse(Environment.GetEnvironmentVariable("SPIKE_FPS"), out var f) ? f : 30;

        var w = new Window
        {
            Title = "AangSpike", Width = 470, Height = 310, Left = 1430, Top = 740,
            WindowStyle = WindowStyle.None, AllowsTransparency = true, Background = Brushes.Transparent,
            Topmost = true, ShowInTaskbar = false, ShowActivated = false, ResizeMode = ResizeMode.NoResize,
        };

        // Canvas has no background brush on purpose: WPF should not hit-test empty areas.
        var canvas = new Canvas { Width = 470, Height = 310 };
        RenderOptions.SetEdgeMode(canvas, EdgeMode.Aliased);

        var bubble = new Border
        {
            Width = 257, Height = 120, CornerRadius = new CornerRadius(12),
            Background = new SolidColorBrush(Color.FromArgb(240, 13, 10, 30)),
            BorderBrush = new SolidColorBrush(Color.FromRgb(0xe8, 0xa3, 0x3a)), BorderThickness = new Thickness(2),
        };
        var label = new TextBlock { Foreground = Brushes.White, FontSize = 14, Text = "spike bubble", Margin = new Thickness(14, 12, 0, 0) };
        bubble.Child = label;
        Canvas.SetLeft(bubble, 5); Canvas.SetTop(bubble, 5);

        Rectangle Box(double x, double y, double ww, double hh, Color c)
        {
            var r = new Rectangle { Width = ww, Height = hh, Fill = new SolidColorBrush(c) };
            Canvas.SetLeft(r, x); Canvas.SetTop(r, y); return r;
        }
        var head = Box(338, 160, 44, 44, Color.FromRgb(0xe9, 0xc9, 0xa8));
        var body = Box(330, 204, 60, 66, Color.FromRgb(0xe8, 0xb9, 0x3a));
        var glow = Box(326, 272, 68, 10, Color.FromRgb(0x7a, 0x4b, 0x9a));

        canvas.Children.Add(bubble); canvas.Children.Add(head); canvas.Children.Add(body); canvas.Children.Add(glow);
        w.Content = canvas;

        // no-activate + tool window: must never steal focus from the game
        w.SourceInitialized += (_, _) =>
        {
            var h = new WindowInteropHelper(w).Handle;
            int ex = Native.GetWindowLong(h, -20);
            Native.SetWindowLong(h, -20, ex | 0x08000000 | 0x80);
        };

        int t = 0;
        var timer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(1000.0 / fps) };
        timer.Tick += (_, _) =>
        {
            t++;
            double bob = Math.Round(Math.Sin(t / 8.0) * 3);
            Canvas.SetTop(head, 160 + bob); Canvas.SetTop(body, 204 + bob);
            label.Text = "spike bubble " + (t % 100);
        };
        timer.Start();

        new Application().Run(w);
    }
}
