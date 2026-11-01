// visionset.mjs - make the vision race's pictures and their answers, mechanically (2026-11-01, his "vision and understanding").
//
// Each picture is a real page (or a mock app) screenshotted at 1280x800 as a JPEG at quality 70, the size Aang already
// sends (Look.cs). The page itself says where every control is and what every word says, so the answers come from the
// page, not from anyone's opinion:
//   find  "where is X": the right answer is X's box on the screenshot (a point inside it passes)
//   read  "what does it say": a pattern the page's own text gives
//   what  "what is this": a pattern naming the app or site
// Output: <dir>/<id>.jpg and <dir>/set.json. Run from AangApp/src/Core (it has Playwright):
//   node ../../tools/measure/visionset.mjs <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Playwright lives in src/Core's node_modules, not beside this file: resolve it from where the script is run.
const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');

const dir = process.argv[2];
mkdirSync(dir, { recursive: true });

const MOCK = `<!doctype html><html><head><style>
body{margin:0;font:14px Segoe UI,sans-serif;background:#1e1f24;color:#ddd}
.bar{display:flex;gap:8px;padding:10px;background:#2a2c33}.bar button{background:#3a3d46;color:#eee;border:0;padding:8px 14px;border-radius:6px}
.side{position:absolute;top:56px;left:0;width:220px;bottom:0;background:#24262c;padding:10px}.side div{padding:8px;border-radius:4px}
.main{position:absolute;top:56px;left:230px;right:0;bottom:0;padding:20px}
.dlg{position:absolute;left:520px;top:300px;width:360px;padding:20px;background:#33363f;border-radius:10px;box-shadow:0 8px 30px #000}
.dlg button{margin-right:10px;padding:8px 18px;border:0;border-radius:6px}.del{background:#c0392b;color:#fff}
</style></head><body>
<div class="bar"><button>New</button><button>Open</button><button>Save</button><button>Export</button><span style="flex:1"></span><button>Settings</button></div>
<div class="side"><div>Inbox (12)</div><div>Drafts</div><div>Sent</div><div>Archive</div><div>Trash</div></div>
<div class="main"><h2>Quarterly report.docx</h2><p>Last edited 14 minutes ago by Joshua. Version 3.2.1</p></div>
<div class="dlg"><b>Delete "Quarterly report.docx"?</b><p>This moves it to the Trash.</p><button>Cancel</button><button class="del">Delete</button></div>
</body></html>`;

// Each page: where to open it, then the questions, each naming how to find its answer on the page.
const PAGES = [
  { id: 'mockapp', html: MOCK, what: /document|file|editor|mail|app|delete|dialog/i, find: [
    ['the Export button', 'button:has-text("Export")'], ['the Settings button', 'button:has-text("Settings")'],
    ['the red Delete button', 'button.del'], ['the Cancel button', 'button:has-text("Cancel")'], ['Drafts in the side list', '.side div:has-text("Drafts")'],
  ], read: [['What version number is shown?', /3\.2\.1/], ['How many messages are in the Inbox?', /12/], ['What file is about to be deleted?', /quarterly report/i],
    ['What is the last item in the side list?', /trash/i], ['How long ago was the file last edited?', /14 min/i]],
    snips: [{ id: 'snip-dialog', sel: '.dlg', qs: [['read', 'What happens if I press the red button?', /trash|delet/i], ['read', 'Which file is this about?', /quarterly/i]] }] },
  { id: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Avatar:_The_Last_Airbender', what: /wikipedia|avatar/i, find: [
    ['the search box', '#searchInput, input[name="search"]'], ['the "Talk" tab', '#ca-talk, a:has-text("Talk")'],
    ['the "Dark" option under Color', 'text="Dark"'], ['the "View history" link', 'text="View history"'], ['"Voice cast" in the contents', 'text="Voice cast"'],
    ['the "Log in" link', 'text="Log in"'],
  ], read: [['What is the title of this article?', /avatar/i], ['In what year did it first air?', /2005/],
    ['Who is the first person listed under "Voices of"?', /zach tyler/i], ['How many languages is this article available in?', /65/]],
    snips: [{ id: 'snip-infobox', sel: '.infobox', maxH: 500, qs: [['what', 'What is this snip about? Answer in a few words.', /avatar|airbender/i],
      ['read', 'Who created this show?', /dimartino|konietzko/i], ['read', 'Name one genre listed.', /action|comedy|fantasy|coming/i]] }] },
  { id: 'github', url: 'https://github.com/ollama/ollama', what: /github|ollama/i, find: [
    ['the "Issues" tab', 'a#issues-tab, a[data-tab-item="issues-tab"]'], ['the green "Code" button', 'button:has-text("Code")'],
  ], read: [['What is the name of this repository?', /ollama/i]] },
  { id: 'ollamalib', url: 'https://ollama.com/library/qwen3.5', what: /ollama|qwen/i, find: [['the search box', 'input[type="search"], input[name="q"]']],
    read: [['Which model is this page about?', /qwen/i]] },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const set = [];
for (const p of PAGES) {
  try {
    if (p.html) await page.setContent(p.html); else await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2500);
    const file = path.join(dir, p.id + '.jpg');
    await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
    const qs = [{ kind: 'what', q: 'What app or website is this? Answer in a few words.', want: p.what.source, flags: p.what.flags }];
    for (const [q, want] of p.read) qs.push({ kind: 'read', q, want: want.source, flags: want.flags });
    for (const [name, sel] of p.find) {
      const box = await page.locator(sel).first().boundingBox().catch(() => null);
      if (box && box.y >= 0 && box.y + box.height <= 800) qs.push({ kind: 'find', q: name, box });
      else console.log(`  ${p.id}: "${name}" is not on screen, left out`);
    }
    set.push({ id: p.id, file: p.id + '.jpg', qs });
    console.log(`${p.id}: ${qs.length} questions`);
    // Snipit-sized crops (his Ctrl+Shift+Plus snips are PNGs of part of the screen): the same page, one region of it.
    for (const s of p.snips ?? []) {
      const b = await page.locator(s.sel).first().boundingBox();
      const clip = { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, s.maxH ?? b.height, 800 - b.y) };
      await page.screenshot({ path: path.join(dir, s.id + '.png'), clip });
      set.push({ id: s.id, file: s.id + '.png', w: Math.round(clip.width), h: Math.round(clip.height),
        qs: s.qs.map(([kind, q, want]) => ({ kind, q, want: want.source, flags: want.flags })) });
      console.log(`${s.id}: ${s.qs.length} questions (snip)`);
    }
  } catch (e) { console.log(`${p.id}: skipped (${e.message.slice(0, 80)})`); }
}
await browser.close();
writeFileSync(path.join(dir, 'set.json'), JSON.stringify(set, null, 1));
