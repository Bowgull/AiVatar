using System.Text.Json;
using Aang.Reader;
using Xunit;

// BG8: the pure parts of AangReader --botw-pos (src/Reader/BotwPos.cs). Reading Cemu itself is checked by Joshua on his
// first play session (the address is only verified on the JP copy); here: the log, the bounds, facing, the file.
public class BotwPosTests
{
    [Fact]
    public void The_memory_base_is_the_last_one_in_the_log()
    {
        const string log = "[11:29:16.522] Init Wii U memory space (base: 0x0000019598260000)\n[11:40:00.000] something\n" +
                           "[12:01:02.003] Init Wii U memory space (base: 0x00000201AB000000)\n";
        Assert.Equal(0x00000201AB000000L, BotwPos.ParseBase(log));
        Assert.Null(BotwPos.ParseBase("[11:29:22.264] ------- Run title -------"));
    }

    [Fact]
    public void Floats_are_big_endian()
    {
        byte[] Be(float f) { var b = BitConverter.GetBytes(f); Array.Reverse(b); return b; }
        var buf = Be(1610.01f).Concat(Be(116.56f)).Concat(Be(475.09f)).ToArray();
        var (x, y, z) = BotwPos.Floats(buf);
        Assert.Equal(1610.01f, x); Assert.Equal(116.56f, y); Assert.Equal(475.09f, z);
    }

    [Fact]
    public void Only_a_believable_position_counts()
    {
        Assert.True(BotwPos.Believable(1610f, 116f, 475f));
        Assert.True(BotwPos.Believable(-4900f, 1200f, 3900f));
        Assert.False(BotwPos.Believable(0f, 0f, 0f));            // empty memory
        Assert.False(BotwPos.Believable(float.NaN, 1f, 1f));
        Assert.False(BotwPos.Believable(1e-30f, 100f, 100f));    // a denormal: not a float that means anything here
        Assert.False(BotwPos.Believable(9000f, 100f, 100f));     // outside Hyrule
        Assert.False(BotwPos.Believable(100f, 9000f, 100f));
    }

    [Fact]
    public void Facing_comes_from_movement()
    {
        var t = new BotwPos.Track();
        t.Add(0, 0, 0);
        Assert.Equal(-1, t.Facing);                    // not moved yet
        t.Add(0, 0, -5); Assert.Equal(0, t.Facing);    // north is -z
        t.Add(5, 0, -5); Assert.Equal(90, t.Facing);   // east
        t.Add(5, 0, -4.8); Assert.Equal(90, t.Facing); // a 0.2 m wobble keeps the facing
        t.Add(5, 0, 0); Assert.Equal(180, t.Facing);   // south
        t.Add(-1000, 0, 0); Assert.Equal(180, t.Facing); // a warp says nothing about facing
        t.Add(-1005, 0, 0); Assert.Equal(270, t.Facing); // west
    }

    [Fact]
    public void Pos_json_has_the_contract_shape_and_closing_marks_it_not_live()
    {
        var t = new BotwPos.Track(); t.Add(1610.012, 116.556, 475.094); t.Add(1612, 116.5, 475.094);
        using var doc = JsonDocument.Parse(BotwPos.Json(t, true, new DateTime(2026, 11, 3, 15, 0, 0, DateTimeKind.Utc)));
        var r = doc.RootElement;
        Assert.Equal(1, r.GetProperty("v").GetInt32());
        Assert.Equal("2026-11-03T15:00:00.000Z", r.GetProperty("at").GetString());
        Assert.Equal(1612, r.GetProperty("x").GetDouble()); Assert.Equal(90, r.GetProperty("facing").GetDouble());
        Assert.True(r.GetProperty("live").GetBoolean());

        var file = Path.Combine(Path.GetTempPath(), $"aang-botw-pos-{Guid.NewGuid():N}.json");
        try
        {
            File.WriteAllText(file, BotwPos.Json(t, true, DateTime.UtcNow));
            BotwPos.MarkClosed(file);
            using var after = JsonDocument.Parse(File.ReadAllText(file));
            Assert.False(after.RootElement.GetProperty("live").GetBoolean());
            Assert.Equal(1612, after.RootElement.GetProperty("x").GetDouble());
        }
        finally { File.Delete(file); }
    }
}
