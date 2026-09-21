namespace Aang.Body;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        // `Aang.exe --selftest-dock`: checks the docking geometry without opening a window.
        if (args.Contains("--selftest-dock"))
        {
            var bad = Docking.SelfTest(Console.Out);
            Console.Out.WriteLine(bad == 0 ? "all docking checks passed" : $"{bad} docking check(s) failed");
            return bad == 0 ? 0 : 1;
        }
        using var single = new Mutex(true, @"Local\Aang.Body.Single", out var first);
        if (!first) return 0;

        // A crash in the pet must be logged, never silent, and must not leave a zombie window.
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log.Write("UI exception: " + e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Write("fatal: " + e.ExceptionObject);

        ApplicationConfiguration.Initialize();
        try { Application.Run(new PetWindow(args)); }
        catch (Exception e) { Log.Write("startup failed: " + e); MessageBox.Show(e.Message, "Aang could not start"); }
        return 0;
    }
}
