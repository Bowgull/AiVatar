// A look at the fire remote in a browser without the real laptop: the fake laptop (awake, WoW up, people chatting)
// and the remote on 127.0.0.1:47880. Tooltips use the real Wowhead. Not a test (node --test only runs *.test.ts).
//   node --no-warnings test/omashu-dev.ts      then open the printed link at phone size
import { FakeLaptop } from './fakes/omashulaptop.ts';
import { OmashuRemote } from '../src/omashuremote.ts';

const MAC = '02:00:5e:10:20:30', KEY = 'dev-laptop-key-0123456789abcdef', PHONE = 'dev-phone-key-0123456789abcdef';
const lap = new FakeLaptop({ key: KEY, mac: MAC });
await lap.start();
if (process.argv.includes('--asleep')) lap.awake = false; else lap.startWow();
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
];
let i = 0;
for (; i < 9; i++) lap.log(say[i]);
setInterval(() => { if (lap.game === 'wow') lap.log(say[i++ % say.length]); }, 8000);
