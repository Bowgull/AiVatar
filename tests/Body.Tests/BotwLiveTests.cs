using System.Text;
using System.Text.Json;
using Aang.Reader;
using Xunit;

// BG10: the pure parts of AangReader --botw-live (src/Reader/BotwLive.cs), against a made-up copy of the game's memory
// laid out as the research says v208 lays it out (Aang/research_notes/BotW guide/live_memory.md). Reading Cemu itself
// is checked on his first session with a guide page open: the reader's "probe" line in the brain's log.
public class BotwLiveTests
{
    /// <summary>A sparse guest memory: big-endian words and text put at guest addresses; anything unset reads as zero,
    /// and an address outside every page put down fails to read (as an unmapped page does).</summary>
    sealed class FakeMem : IGuestMem
    {
        readonly Dictionary<long, byte[]> pages = new();
        byte[] Page(long a, bool make) { long k = a >> 12; if (!pages.TryGetValue(k, out var p) && make) pages[k] = p = new byte[4096]; return p!; }
        public void Bytes(long at, params byte[] b) { for (int i = 0; i < b.Length; i++) Page(at + i, true)[(at + i) & 4095] = b[i]; }
        public void U32(long at, long v) => Bytes(at, (byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v);
        public void F32(long at, float f) => U32(at, (uint)BitConverter.SingleToInt32Bits(f));
        public void Text(long at, string s) => Bytes(at, Encoding.ASCII.GetBytes(s + "\0"));
        public bool Read(long guest, byte[] buf, int n)
        {
            for (int i = 0; i < n; i++) { var p = Page(guest + i, false); if (p == null) return false; buf[i] = p[(guest + i) & 4095]; }
            return true;
        }
    }

    const long INFO = 0x20000000, ACTOR = 0x30000000, MGR = 0x40000000, ITEMS = 0x41000000, GDT = 0x50000000;

    static FakeMem Game(int life = 12, float cap = 12, int yellowHearts = 0, float green = 800, float staminaCap = 1000, float yellowStamina = 0)
    {
        var m = new FakeMem();
        m.Text(BotwLiveReader.STR_MAXHART, "MaxHartValue"); m.Text(BotwLiveReader.STR_ENERGYADD, "Item_EnergyMaxAdd");
        m.U32(BotwLiveReader.PLAYER_INFO, INFO);
        m.U32(INFO + 0x30, ACTOR); m.F32(INFO + 0x4C, 1610f); m.F32(INFO + 0x50, 116f); m.F32(INFO + 0x54, 475f);
        m.F32(INFO + 0x64, cap); m.F32(INFO + 0x68, green); m.F32(INFO + 0x6C, staminaCap);
        m.U32(ACTOR + 0x540, life); m.U32(ACTOR + 0x1320, (long)cap + yellowHearts); m.U32(ACTOR + 0x1A24, yellowHearts); m.F32(ACTOR + 0x1A28, yellowStamina);
        return m;
    }
    /// <summary>The pouch list: a sentinel in the manager, each item's node at its start (previous, then next).</summary>
    static void Pouch(FakeMem m, bool nextFirst, params (int type, string id, int value, bool on, bool inPouch)[] items)
    {
        long sentinel = MGR + 0x4C;
        m.U32(BotwLiveReader.PAUSE_MGR, MGR);
        long At(int i) => i < 0 || i >= items.Length ? sentinel : ITEMS + i * 0x100;
        m.U32(sentinel, At(items.Length - 1)); m.U32(sentinel + 4, At(0)); m.U32(sentinel + 8, items.Length); m.U32(MGR + 0x58, 0);
        for (int i = 0; i < items.Length; i++)
        {
            long a = At(i), prev = At(i - 1), next = At(i + 1);
            m.U32(a, nextFirst ? next : prev); m.U32(a + 4, nextFirst ? prev : next);
            m.U32(a + 0x08, items[i].type); m.U32(a + 0x10, items[i].value);
            m.Bytes(a + 0x14, (byte)(items[i].on ? 1 : 0), (byte)(items[i].inPouch ? 1 : 0));
            m.Text(a + 0x24, items[i].id);
        }
    }
    static void Flags(FakeMem m, long objBase, params (string name, int value)[] flags)
    {
        long slot = GDT + 0x1000, table = GDT + 0x2000, array = GDT + 0x3000;
        m.U32(BotwLiveReader.GDT_MGR, GDT); m.U32(GDT + 0x710, slot); m.U32(slot, table);
        m.U32(table + 0x10, flags.Length); m.U32(table + 0x18, array);
        for (int i = 0; i < flags.Length; i++) { long o = objBase + i * 0x20; m.U32(array + i * 4, o); m.U32(o + 0x14, flags[i].value); m.U32(o + 0x18, BotwLiveReader.Crc32(flags[i].name)); }
    }

    [Fact]
    public void The_name_hash_is_the_games_crc32()
    {
        Assert.Equal(0x23149bf8u, BotwLiveReader.Crc32("CurrentRupee"));
        Assert.Equal(0x2906f327u, BotwLiveReader.Crc32("MaxHartValue"));
    }

    [Fact]
    public void The_build_is_proven_by_two_names_before_anything_is_read()
    {
        Assert.True(new BotwLiveReader(Game()).IsV208());
        var other = new FakeMem(); other.Text(BotwLiveReader.STR_MAXHART, "MaxHartValue"); other.Text(BotwLiveReader.STR_ENERGYADD, "SomethingElseHere1");
        Assert.False(new BotwLiveReader(other).IsV208());
        Assert.False(new BotwLiveReader(new FakeMem()).IsV208());
    }

    [Fact]
    public void Hearts_and_stamina_read_in_the_games_units()
    {
        var (state, v) = new BotwLiveReader(Game(life: 9, cap: 12, green: 812.4f)).ReadVitals();
        Assert.Equal("play", state);
        Assert.Equal((9, 12, 0), (v!.Life, v.Cap, v.Yellow));
        Assert.Equal((812.0, 1000.0, 0.0), (v.Green, v.StaminaCap, v.YellowStamina));
        Assert.Equal(1610f, v.X);
    }

    [Fact]
    public void Yellow_hearts_are_the_life_over_the_red_cap()
    {
        // a hearty dish: 3 red hearts and 2 yellow (8 quarters granted), one yellow already lost
        var (_, v) = new BotwLiveReader(Game(life: 16, cap: 12, yellowHearts: 8, yellowStamina: 400)).ReadVitals();
        Assert.Equal((16, 12, 4), (v!.Life, v.Cap, v.Yellow));
        Assert.Equal(400.0, v.YellowStamina);
    }

    [Fact]
    public void No_player_is_the_menu_and_unbelievable_numbers_are_a_load()
    {
        Assert.Equal("menu", new BotwLiveReader(new FakeMem()).ReadVitals().state);
        var noActor = Game(); noActor.U32(INFO + 0x30, 0);
        Assert.Equal("menu", new BotwLiveReader(noActor).ReadVitals().state);
        Assert.Equal(("loading", null), new BotwLiveReader(Game(cap: 500)).ReadVitals());          // more than 30 hearts
        Assert.Equal(("loading", null), new BotwLiveReader(Game(life: 40, cap: 12)).ReadVitals());   // more life than he can hold
        Assert.Equal(("loading", null), new BotwLiveReader(Game(staminaCap: 50)).ReadVitals());      // under one wheel
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void The_pouch_is_walked_whichever_word_of_a_node_is_next(bool nextFirst)
    {
        var m = Game();
        Pouch(m, nextFirst, (0, "Weapon_Sword_062", 1800, true, true), (0, "Weapon_Sword_013", 2600, false, true), (1, "Weapon_Bow_001", 2200, true, true),
            (2, "NormalArrow", 12, true, true), (2, "FireArrow", 5, false, true), (4, "Armor_001_Head", 1, true, true), (5, "Armor_001_Upper", 1, true, true),
            (6, "Armor_001_Lower", 1, true, true), (7, "Item_Fruit_A", 6, false, true), (7, "Item_Mushroom_E", 2, false, false));
        var p = new BotwLiveReader(m).ReadPouch();
        Assert.NotNull(p);
        Assert.Equal(9, p!.Count);   // the one not really in the pouch is left out
        Assert.Equal("Weapon_Sword_062", p[0].Id);
        Assert.Contains(p, it => it.Id == "Item_Fruit_A" && it.Type == 7 && it.Value == 6);
        var live = JsonSerializer.Deserialize<JsonElement>(BotwLiveDoc.Body(BotwLiveDoc.Live("play", null, 396, p)));
        var eq = live.GetProperty("equip");
        Assert.Equal("Weapon_Sword_062", eq.GetProperty("sword").GetString());
        Assert.Equal("Weapon_Bow_001", eq.GetProperty("bow").GetString());
        Assert.Equal("NormalArrow", eq.GetProperty("arrow").GetString());
        Assert.Equal(JsonValueKind.Null, eq.GetProperty("shield").ValueKind);
        Assert.Equal("Armor_001_Upper", eq.GetProperty("upper").GetString());
        Assert.Equal(12, live.GetProperty("arrows").GetInt32());
        Assert.Equal(396, live.GetProperty("rupees").GetInt32());
    }

    [Fact]
    public void A_list_that_is_not_one_reads_as_nothing_rather_than_as_rubbish()
    {
        var empty = Game(); Pouch(empty, false);
        Assert.Empty(new BotwLiveReader(empty).ReadPouch()!);
        Assert.Null(new BotwLiveReader(Game()).ReadPouch());                                   // no pouch manager yet
        var odd = Game(); Pouch(odd, false, (0, "Weapon_Sword_062", 1, true, true), (12, "Weapon_Sword_013", 1, false, true));
        Assert.Null(new BotwLiveReader(odd).ReadPouch());                                      // a kind the game has not
        var name = Game(); Pouch(name, false, (7, "Item Fruit!", 1, false, true));
        Assert.Null(new BotwLiveReader(name).ReadPouch());                                     // not an actor name
        var broken = Game(); Pouch(broken, false, (7, "Item_Fruit_A", 1, false, true), (7, "Item_Fruit_B", 1, false, true)); broken.U32(ITEMS + 0x100 + 4, 0x12345678);
        Assert.Null(new BotwLiveReader(broken).ReadPouch());                                   // the chain leads nowhere
    }

    [Fact]
    public void Rupees_are_found_by_name_and_found_again_after_a_reload_moves_them()
    {
        var m = Game(); Flags(m, GDT + 0x4000, ("MaxHartValue", 12), ("CurrentRupee", 396), ("KorokNuts", 4));
        var r = new BotwLiveReader(m);
        Assert.Equal(396, r.ReadRupees());
        m.U32(GDT + 0x4000 + 0x20 + 0x14, 401);
        Assert.Equal(401, r.ReadRupees());                       // the same object, read straight
        Flags(m, GDT + 0x8000, ("CurrentRupee", 25));           // a reload: the tables point somewhere new
        m.U32(GDT + 0x4000 + 0x20 + 0x18, 0);                    // and the old object is something else now
        Assert.Equal(25, r.ReadRupees());
        Assert.Null(new BotwLiveReader(Game()).ReadRupees());   // no flags loaded
    }

    [Fact]
    public void The_file_carries_the_time_a_count_and_whether_it_is_live()
    {
        var (state, v) = new BotwLiveReader(Game(life: 10)).ReadVitals();
        var body = BotwLiveDoc.Live(state, v, null, null);
        Assert.Equal(BotwLiveDoc.Body(body), BotwLiveDoc.Body(BotwLiveDoc.Live(state, v, null, null)));   // the same reads, the same text
        var f = JsonSerializer.Deserialize<JsonElement>(BotwLiveDoc.File(body, true, 7, new DateTime(2026, 11, 4, 20, 0, 0, DateTimeKind.Utc)));
        Assert.Equal(1, f.GetProperty("v").GetInt32());
        Assert.Equal("2026-11-04T20:00:00.000Z", f.GetProperty("at").GetString());
        Assert.Equal(7, f.GetProperty("seq").GetInt64());
        Assert.True(f.GetProperty("live").GetBoolean());
        Assert.Equal("play", f.GetProperty("state").GetString());
        Assert.Equal(10, f.GetProperty("hearts").GetProperty("life").GetInt32());
        Assert.False(f.TryGetProperty("equip", out _));   // no pouch read: no gear claimed
    }

    [Fact]
    public void A_page_wants_the_values_only_while_its_lease_is_fresh()
    {
        string f = Path.Combine(Path.GetTempPath(), $"aang-want-{Guid.NewGuid():N}.json");
        try
        {
            Assert.False(BotwLive.Wanted(f));
            File.WriteAllText(f, "{}");
            Assert.True(BotwLive.Wanted(f));
            File.SetLastWriteTimeUtc(f, DateTime.UtcNow.AddMilliseconds(-BotwLive.LEASE_MS - 2000));
            Assert.False(BotwLive.Wanted(f));
        }
        finally { File.Delete(f); }
    }
}
