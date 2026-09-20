namespace Aang.Body;

/// <summary>Which animation is playing, which frame, and when the next frame is due.</summary>
sealed class Anim
{
    static readonly Dictionary<string, (int Fps, bool Loop)> Spec = new()
    {
        ["idle"] = (6, true),
        ["talk"] = (10, true),
        ["think"] = (8, true),
        ["nap"] = (3, true),
        ["walk"] = (8, true),
        ["scooter"] = (10, true),
        ["look"] = (10, false),
        ["hello"] = (10, false),
        ["spin"] = (12, false),
        ["zip"] = (12, false),
    };

    DateTime due = DateTime.MinValue;

    public string State { get; private set; } = "idle";
    public int Frame { get; private set; }
    public int FrameMs => 1000 / Spec[State].Fps;
    public static bool IsKnown(string s) => Spec.ContainsKey(s);

    public void Play(string state)
    {
        if (!Spec.ContainsKey(state)) state = "idle";
        State = state; Frame = 0; due = DateTime.UtcNow;
    }

    /// <summary>Advance if the next frame is due. <paramref name="finished"/> is set when a one-shot ends.</summary>
    public bool Tick(DateTime now, int frameCount, out bool finished)
    {
        finished = false;
        if (now < due) return false;
        var (fps, loop) = Spec[State];
        due = now.AddMilliseconds(1000.0 / fps);
        if (Frame + 1 >= frameCount)
        {
            if (loop) { Frame = 0; return true; }
            finished = true;
            return false;
        }
        Frame++;
        return true;
    }
}
