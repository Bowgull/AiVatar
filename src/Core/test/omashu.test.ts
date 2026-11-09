// The phone fire remote's pure parts (omashu.ts): wake packets, who may use it, reading WoW's chat log, what may be
// sent to WoW, and Wowhead tooltips turned into plain lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowed, buildLine, isHomeAddress, magicPacket, parseChatLine, segments, tooltipLines } from '../src/omashu.ts';

test('a magic packet is six 0xFF and the MAC sixteen times', () => {
  const p = magicPacket('aa:bb:cc:dd:ee:ff');
  assert.equal(p.length, 102);
  assert.ok(p.subarray(0, 6).every(b => b === 0xff));
  for (let i = 0; i < 16; i++) assert.equal(p.subarray(6 + i * 6, 12 + i * 6).toString('hex'), 'aabbccddeeff');
  assert.deepEqual(magicPacket('AA-BB-CC-DD-EE-FF'), p);
  assert.throws(() => magicPacket('not a mac'));
});

test('home Wi-Fi only: private LAN yes, Tailscale and the internet no', () => {
  for (const ip of ['127.0.0.1', '::1', '192.168.1.20', '::ffff:192.168.0.5', '10.0.0.7', '172.20.1.1', 'fe80::1', 'fd12::3'])
    assert.ok(isHomeAddress(ip), ip);
  for (const ip of ['100.101.102.103', '::ffff:100.64.0.1', '8.8.8.8', '172.32.0.1', '2001:db8::1', ''])
    assert.ok(!isHomeAddress(ip), ip);
});

test('chat log lines: channels, guild, party, whispers both ways, say, system', () => {
  const g = parseChatLine('11/8 19:42:01.122  [Guild] Morrowyn: grats on 11!', 1)!;
  assert.deepEqual({ k: g.kind, who: g.who, t: g.t, text: g.text }, { k: 'guild', who: 'Morrowyn', t: '7:42', text: [{ s: 'grats on 11!' }] });
  const c = parseChatLine('11/8 19:41:22.000  [1. General - Elwynn Forest] Thornwick: anyone know where the tomb weed is', 2)!;
  assert.equal(c.kind, 'channel'); assert.deepEqual(c.chan, { num: 1, name: 'General' }); assert.equal(c.who, 'Thornwick');
  assert.deepEqual(parseChatLine('11/8 19:41:22.000  [4. LookingForGroup] Ana: lfm', 3)!.chan, { num: 4, name: 'LookingForGroup' });
  const w = parseChatLine('11/8 19:45:00.000  Morrowyn-Faerlina whispers: you around for a dungeon?', 4)!;
  assert.equal(w.kind, 'whisper'); assert.equal(w.who, 'Morrowyn-Faerlina');
  const o = parseChatLine('11/8 19:45:30.000  To Morrowyn: yeah give me 10', 5)!;
  assert.equal(o.kind, 'whisper-out'); assert.equal(o.who, 'Morrowyn');
  assert.equal(parseChatLine('11/8 19:46:00.000  [Party Leader] Hadrik: inv me', 6)!.kind, 'party');
  assert.equal(parseChatLine('11/8 19:46:00.000  [Raid Warning] Hadrik: go', 6)!.kind, 'raid');
  assert.equal(parseChatLine('11/8 19:46:00.000  Hadrik says: hi', 7)!.kind, 'say');
  assert.equal(parseChatLine('11/8 19:46:00.000  Hadrik yells: run', 7)!.kind, 'yell');
  const s = parseChatLine('11/8 19:46:00.000  Bujuju Banton has earned the achievement [Level 11]!', 8)!;
  assert.equal(s.kind, 'system'); assert.equal(s.who, undefined);
  assert.equal(parseChatLine('11/8 00:05:00.000  [Guild] A1: x', 9)!.t, '12:05');
  assert.equal(parseChatLine('   ', 10), null);
});

test('links: codes give an id and quality, bare [Names] are looked up by name, other codes are dropped', () => {
  const coded = segments('WTS |cff1eff00|Hitem:9811::::::::12:::::::|h[Grips of Control]|h|r 2g');
  assert.deepEqual(coded, [{ s: 'WTS ' }, { link: 'item', name: 'Grips of Control', id: 9811, q: 2 }, { s: ' 2g' }]);
  assert.deepEqual(segments('run |cffffff00|Hquest:2160:12|h[Bandarion Keep]|h|r later')[1], { link: 'quest', name: 'Bandarion Keep', id: 2160 });
  assert.deepEqual(segments('|cff71d5ff|Hspell:133|h[Fireball]|h|r')[0], { link: 'spell', name: 'Fireball', id: 133 });
  assert.deepEqual(segments('WTS [Grips of Control] 2g')[1], { link: 'unknown', name: 'Grips of Control' });
  assert.deepEqual(segments('hi |TInterface\\Icons\\x:0|t |cffff0000red|r'), [{ s: 'hi  red' }]);
  // a player link in a line becomes the plain full name
  assert.equal(parseChatLine('11/8 19:42:01.122  [Guild] |Hplayer:Morrowyn-Faerlina:12:GUILD|h[Morrowyn]|h: yo', 1)!.who, 'Morrowyn-Faerlina');
});

test('sending: only the approved commands can be built', () => {
  assert.equal(buildLine({ to: 'guild', text: 'count me in' }), '/g count me in');
  assert.equal(buildLine({ to: 'say', text: '  hello\nthere ' }), '/s hello there');
  assert.equal(buildLine({ to: 'party', text: 'inv' }), '/p inv');
  assert.equal(buildLine({ to: 'channel', num: 2, text: 'WTB bags' }), '/2 WTB bags');
  assert.equal(buildLine({ to: 'whisper', name: 'Hadrik-Faerlina', text: 'omw' }), '/w Hadrik-Faerlina omw');
  assert.equal(buildLine({ act: 'invite', name: 'Hadrik' }), '/invite Hadrik');
  assert.equal(buildLine({ act: 'roll' }), '/roll');
  assert.equal(buildLine({ act: 'wave', name: 'Hadrik' }), '/wave Hadrik');
  // never anything else
  for (const bad of [
    { to: 'say', text: '/run DoEmote("x")' }, { to: 'guild', text: '' }, { to: 'say', text: 'a |cffff0000fake|r link' },
    { to: 'channel', num: 0, text: 'x' }, { to: 'channel', num: 10, text: 'x' }, { to: 'whisper', name: 'a b', text: 'x' }, { to: 'whisper', name: 'Had rik', text: 'x' }, { act: 'who', name: ' Hadrik' },
    { to: 'whisper', name: '/run', text: 'x' }, { act: 'invite', name: 'x /script' }, { act: 'kick', name: 'Hadrik' },
    { to: 'raid', text: 'x' }, { to: 'say', text: 'x'.repeat(260) }, null,
  ]) assert.equal(buildLine(bad as never), null, JSON.stringify(bad));
  for (const bad of ['/run x', '/script x', '/console x', '/s /run x', '/g a\nb', '/w Name', '/roll 100', '/dance'])
    assert.ok(!allowed(bad), bad);
});

test('Wowhead tooltip HTML becomes plain coloured lines, two columns kept', () => {
  const html = '<table><tr><td><!--nstart--><b class="q2">Grips of Control</b><!--nend--><span class="q"><br>Item Level <!--ilvl-->17</span><br>Binds when equipped'
    + '<table width="100%"><tr><td>Hands</td><th><!--scstart4:1--><span class="q1">Cloth</span><!--scend--></th></tr></table>'
    + '<span><!--amr-->18 Armor</span><br><span>+3 Intellect</span></td></tr></table><table><tr><td><span class="q2">Equip: Increases damage &amp; healing.</span>'
    + '<br>Requires Level 12<br>Sell Price: <span class="moneycopper">31</span></td></tr></table><script>x</script>';
  const l = tooltipLines(html);
  assert.deepEqual(l[0], { l: 'Grips of Control', c: 'q2' });
  assert.deepEqual(l[1], { l: 'Item Level 17', c: 'q' });
  assert.ok(l.some(x => x.l === 'Hands' && x.r === 'Cloth'));
  assert.ok(l.some(x => x.l === 'Equip: Increases damage & healing.' && x.c === 'q2'));
  assert.ok(l.every(x => !/[<>]/.test(x.l + (x.r ?? ''))));
});
