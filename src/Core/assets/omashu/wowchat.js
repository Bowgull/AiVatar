// The WoW home's chat list (sheet omashu/remote/28, option C, approved 2026-11-27): which channel a line belongs to, the
// Messages-style list (Everything on top, then NEW, then QUIET), unread counts, the order you swipe through, and where a
// reply goes (always the channel you're reading; Everything goes to Say). Pure: remote.html draws it, the tests run it.
// A plain script (no modules): it sets WowChat on the page.
(function (root) {
  'use strict';
  // the channels with a place of their own, in the list's order after the whispers (sheet 28); colours are the game's
  var CHANS = [
    { id: 'guild', name: 'Guild', ic: 'G', col: '#40ff40' },
    { id: 'party', name: 'Party', ic: 'P', col: '#aaaaff' },
    { id: 'def', name: 'Defense', ic: '!', col: '#ffff00' },
    { id: 'gen', name: 'General', ic: '1', col: '#ffc0c0' },
    { id: 'lfg', name: 'LFG', ic: '4', col: '#ffc0c0' },
    { id: 'trade', name: 'Trade', ic: '2', col: '#ffc0c0' },
  ];
  var ALL = { id: 'all', name: 'Everything', ic: '★', col: '#efe6d2' };
  var WHISPER_COL = '#ff80ff';
  // the usual numbers, for a channel nobody has spoken in yet
  var DEFAULT_NUM = { gen: 1, trade: 2, def: 3, lfg: 4 };
  var short = function (n) { return String(n || '').split('-')[0]; };

  /** The list row a line belongs to: 'w:<name>' for a whisper either way, a channel id, or null (Everything only). */
  function chanOf(l) {
    if (!l) return null;
    if ((l.kind === 'whisper' || l.kind === 'whisper-out') && l.who) return 'w:' + l.who;
    if (l.kind === 'guild' || l.kind === 'officer') return 'guild';
    if (l.kind === 'party' || l.kind === 'raid') return 'party';
    if (l.kind === 'channel' && l.chan) {
      var n = String(l.chan.name || '');
      if (/^general/i.test(n)) return 'gen';
      if (/^trade/i.test(n)) return 'trade';
      if (/^localdefense|^defense/i.test(n)) return 'def';
      if (/lookingforgroup|^lfg/i.test(n)) return 'lfg';
    }
    return null;
  }
  function inChan(l, id) { return id === 'all' || chanOf(l) === id; }
  /** The short tag a line carries in Everything ("General", "Defense"); inside a channel the header says it once. */
  function tagOf(l) {
    var id = chanOf(l);
    if (l.kind === 'officer') return 'Officer';
    if (l.kind === 'raid') return 'Raid';
    var c = CHANS.filter(function (x) { return x.id === id; })[0];
    if (c) return c.name;
    return l.chan ? String(l.chan.name || '') : '';
  }
  function plain(l) { return (l.text || []).map(function (s) { return 's' in s ? s.s : '[' + s.name + ']'; }).join(''); }
  /** Unread lines of one row: after what was seen, never your own (your echoes and what you whisper). */
  function unread(lines, id, seen, me) {
    var after = seen[id] || 0, n = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.seq <= after || !inChan(l, id) || l.kind === 'whisper-out' || (me && l.who && short(l.who) === short(me))) continue;
      n++;
    }
    return n;
  }
  /** What "seen" starts as for a fresh session: everything read, except the last k whispers in (Aang's count). */
  function initSeen(lines, k) {
    var top = lines.length ? lines[lines.length - 1].seq : 0, seen = { all: top };
    CHANS.forEach(function (c) { seen[c.id] = top; });
    var inc = lines.filter(function (l) { return l.kind === 'whisper' && l.who; });
    var cut = k > 0 ? inc.slice(-k) : [];
    var unreadSeq = {}; cut.forEach(function (l) { unreadSeq[l.seq] = 1; });
    inc.concat(lines.filter(function (l) { return l.kind === 'whisper-out' && l.who; })).forEach(function (l) {
      var id = 'w:' + l.who;
      if (seen[id] === undefined) seen[id] = 0;
      if (!unreadSeq[l.seq] && l.seq > seen[id]) seen[id] = l.seq;
    });
    // a person whose unread whispers sit after lines already seen: seen stays just before the first unread one
    cut.forEach(function (l) { var id = 'w:' + l.who; if (seen[id] >= l.seq) seen[id] = l.seq - 1; });
    return seen;
  }
  /** The list: Everything, then the rows with something new, then the quiet ones. Whispers come first (one row per
   *  person, newest first, the last `people`), then Guild, Party, Defense, General, LFG, Trade. */
  function rows(lines, seen, me, people) {
    people = people || 6;
    var last = {}, who = [];
    for (var i = lines.length - 1; i >= 0; i--) {
      var l = lines[i], id = chanOf(l);
      if (id && !last[id]) last[id] = l;
      if (id && id.indexOf('w:') === 0 && who.indexOf(id) < 0 && who.length < people) who.push(id);
    }
    var top = lines.length ? lines[lines.length - 1] : null;
    var out = [{ id: 'all', name: ALL.name, ic: ALL.ic, col: ALL.col, kind: 'all', last: top, u: 0 }];
    who.forEach(function (id) {
      var n = id.slice(2);
      out.push({ id: id, name: short(n), full: n, ic: short(n).charAt(0).toUpperCase(), col: WHISPER_COL, kind: 'whisper', last: last[id] || null, u: unread(lines, id, seen, me) });
    });
    CHANS.forEach(function (c) { out.push({ id: c.id, name: c.name, ic: c.ic, col: c.col, kind: 'chan', last: last[c.id] || null, u: unread(lines, c.id, seen, me) }); });
    return { all: out[0], fresh: out.slice(1).filter(function (r) { return r.u > 0; }), quiet: out.slice(1).filter(function (r) { return !r.u; }) };
  }
  /** The busy rows you swipe through inside a channel, in list order. */
  function busyOrder(list) { return list.fresh.map(function (r) { return r.id; }); }
  /** Who a reply goes to: the channel being read. Everything (and anything without a place) goes to Say. */
  function replyTo(id, lines, chans) {
    if (!id || id === 'all') return { to: 'say' };
    if (id.indexOf('w:') === 0) return { to: 'whisper', name: id.slice(2) };
    if (id === 'guild' || id === 'party') return { to: id };
    for (var i = lines.length - 1; i >= 0; i--) if (lines[i].chan && chanOf(lines[i]) === id) return { to: 'channel', num: lines[i].chan.num };
    for (var k in chans || {}) if (chanOf({ kind: 'channel', chan: { name: chans[k] } }) === id) return { to: 'channel', num: Number(k) };
    return DEFAULT_NUM[id] ? { to: 'channel', num: DEFAULT_NUM[id] } : { to: 'say' };
  }
  /** The reply box's placeholder. */
  function hint(id) {
    if (!id || id === 'all') return 'Say something…';
    if (id.indexOf('w:') === 0) return 'Whisper ' + short(id.slice(2)).split(' ')[0] + '…';
    var c = CHANS.filter(function (x) { return x.id === id; })[0];
    return 'Message ' + (c ? c.name : id) + '…';
  }
  /** One row's name, colour and glyph, for the conversation header. */
  function info(id) {
    if (id === 'all') return { name: ALL.name, col: ALL.col, sub: 'replies go to Say' };
    if (id.indexOf('w:') === 0) return { name: short(id.slice(2)), col: WHISPER_COL, sub: 'whisper' };
    var c = CHANS.filter(function (x) { return x.id === id; })[0] || { name: id, col: '#efe6d2' };
    return { name: c.name, col: c.col, sub: 'replies go here' };
  }
  root.WowChat = { CHANS: CHANS, chanOf: chanOf, inChan: inChan, tagOf: tagOf, plain: plain, unread: unread, initSeen: initSeen, rows: rows, busyOrder: busyOrder, replyTo: replyTo, hint: hint, info: info, short: short };
})(typeof window !== 'undefined' ? window : globalThis);
