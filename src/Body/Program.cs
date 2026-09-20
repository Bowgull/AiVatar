namespace Aang.Body;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        using var single = new Mutex(true, @"Local\Aang.Body.Single", out var first);
        if (!first) return;

        // A crash in the pet must be logged, never silent, and must not leave a zombie window.
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log.Write("UI exception: " + e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Write("fatal: " + e.ExceptionObject);

        ApplicationConfiguration.Initialize();
        try { Application.Run(new PetWindow(args)); }
        catch (Exception e) { Log.Write("startup failed: " + e); MessageBox.Show(e.Message, "Aang could not start"); }
    }
}
