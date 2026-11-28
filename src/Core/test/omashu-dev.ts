// A look at the fire remote in a browser without the real laptop: the fake laptop (awake, WoW up, people chatting)
// and the remote on 127.0.0.1:47880. Tooltips use the real Wowhead. Not a test (node --test only runs *.test.ts).
//   node --no-warnings test/omashu-dev.ts      then open the printed link at phone size
import { FakeLaptop } from './fakes/omashulaptop.ts';
import { OmashuRemote } from '../src/omashuremote.ts';

const MAC = '02:00:5e:10:20:30', KEY = 'dev-laptop-key-0123456789abcdef', PHONE = 'dev-phone-key-0123456789abcdef';
const lap = new FakeLaptop({ key: KEY, mac: MAC });
await lap.start();
if (process.argv.includes('--asleep')) lap.awake = false; else lap.startWow();
lap.closeMs = Number(process.env.CLOSE_MS ?? 20);
// the Paladin Book (sheet 18): a level 23 Bunji as OmaBook would save him (--allset: nothing to do)
const allset = process.argv.includes('--allset');
lap.bookSave = { class: 'PALADIN', name: 'Bunji', level: 8, money: 32000, xp: 410, xpMax: 1000, zone: 'Duskwood', at: Math.floor(Date.now() / 1000) - 360,
  unspent: allset ? 0 : 1, talents: {},
  skills: { 'Two-Handed Maces': 115 }, spells: ['Devotion Aura', 'Blessing of Might', 'Seal of Righteousness', 'Judgement', 'Holy Strike', 'Holy Light', 'Hammer of Justice', 'Seal of the Crusader', 'Divine Protection'], fresh: allset ? [] : ['Hammer of Justice'],
  train: allset ? [] : [{ name: 'Lay on Hands', lvl: 10, rank: 1, cost: 300 }, { name: 'Seal of Fury', lvl: 10, rank: 1, cost: 300 }, { name: 'Seal of Righteousness', lvl: 10, rank: 2, cost: 300 }, { name: 'Devotion Aura', lvl: 10, rank: 2, cost: 300 }], weapon: { id: 7230, dps: 19.71, sub: 5 }, done: allset ? { 1806: true, 78093: true } : {},
  bags: allset ? { 4542: 14, 1205: 18, 1710: 5, 3241: 3 } : { 5480: 8, 1179: 12, 3241: 1 },
  cu: { rich: false, max: 50000, list: allset ? [] : [{ id: 2264, name: 'Mantle of Thieves', slot: 'Shoulder', price: 11000, pct: 64 }, { id: 15562, name: "Brutish Breastplate", slot: 'Chest', price: 4500, pct: 31 }, { id: 6380, name: 'Inscribed Buckler', slot: 'Off Hand', price: 2200, pct: 12 }] } };
lap.bookPrices = { 929: 1800, 1710: 15000, 3241: 900 };   // e.g. CLOSE_MS=6000: a slow close like the real WoW's
const remote = new OmashuRemote({
  cfg: { port: Number(process.env.PORT ?? 47880), laptop: { url: lap.url, key: KEY, mac: MAC, broadcast: ['127.0.0.1'], wakePort: lap.udpPort }, phones: [{ name: 'Josh', key: PHONE, chat: true }] },
  host: '127.0.0.1', notify: t => console.log(`[buzz] ${t}`),
});
const port = await remote.start();
console.log(`fire remote: http://127.0.0.1:${port}/pair/${PHONE}`);
const say = [
  '[1. General - Elwynn Forest] Thornwick Vale: anyone know where the tomb weed is',
  '[Guild] Morrowyn Ash: grats on 11!',
  '[2. Trade - City] Bellacoin: WTS |cff1eff00|Hitem:2289::::::::12:::::::|h[Scroll of Strength II]|h|r 2g',
  '[Guild] Hadrik Stone: who wants to run |cffffff00|Hquest:2040:22|h[Underground Assault]|h|r later',
  'Morrowyn Ash whispers: you around for a dungeon?',
  '[Party] Hadrik Stone: inv me',
  'Bujuju Banton has earned the achievement [Level 11]!',
  '[Guild] Bujuju Banton: thanks all',
  'Hadrik Stone whispers: bring a mage too if you can',
  '[4. LookingForGroup] Ana Reyes: LF2M Deadmines, need heals',
  'To Hadrik Stone: yeah once I hit 18',
  'Hadrik Stone whispers: perfect, got a spare |cff1eff00|Hitem:2289::::::::12:::::::|h[Scroll of Strength II]|h|r if you want it',
];
// the speakers' classes, as the strip carries them (sheet 30's crests and name colours)
const CLS: Record<string, string> = { 'Thornwick Vale': 'ROGUE', 'Morrowyn Ash': 'MAGE', Bellacoin: 'ROGUE', 'Hadrik Stone': 'WARRIOR', 'Bujuju Banton': 'WARLOCK', 'Ana Reyes': 'SHAMAN' };
const clsOf = (l: string) => Object.keys(CLS).find(n => l.includes(n + ':') || l.startsWith(n + ' whispers'));
const say1 = (l: string) => { const n = clsOf(l); lap.log(l, new Date(), n ? CLS[n] : undefined); };
let i = 0;
for (; i < 12; i++) say1(say[i]);
// the guild list, as OmashuChatLog sends it (sheet 11)
const GUILD = ['Morrowyn Ash|14|MAGE|Silverpine Forest', 'Hadrik Stone|12|WARRIOR|Undercity', 'Thornwick Vale|9|ROGUE|Tirisfal Glades', 'Ana Reyes|8|SHAMAN|Durotar', 'Bujuju Banton|7|WARLOCK|Tirisfal Glades'];
GUILD.forEach((g, k) => lap.log(`{omashu-guild} 1 ${k + 1}/${GUILD.length} ${g}`));
setInterval(() => { if (lap.game === 'wow') say1(say[i++ % say.length]); }, 8000);
