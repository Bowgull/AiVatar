// Sheet 100 (2026-10-28, his "icons are important here too"): each project and topic of the Mockups trail wears an icon,
// Samara's own art where it has one (the lantern, the shield, the broom, Claude's mark), pixel icons for the rest.
// Matched by name, any case. Sheet 119 (2026-11-09): a project it does not know wears the icon Claude named when it
// filed that project's first topic, else the scroll; never a letter.
import { pixIcon } from './pixicons.js';

const img = (src, size) => { const i = document.createElement('img'); i.src = src; i.alt = ''; i.width = size; i.height = size; i.style.imageRendering = 'pixelated'; return i; };
// Big (the Mockups tab's plaques, about 32 px) and small (the left rail's project headings, about 16 px), each at a
// whole-number scale of its art.
const PROJECTS = {
  samara: (sm) => img(sm ? 'art/samara/samara-lantern-16.png' : 'art/samara/samara-lantern-32.png', sm ? 16 : 32),
  'couch mode': (sm) => pixIcon('fire', sm ? 2 : 3),
  waymark: (sm) => pixIcon('post', sm ? 1 : 2),
  'anti-slop': (sm) => img('art/browser/tidy_broom2.png', sm ? 15 : 30),
  'anti slop': (sm) => img('art/browser/tidy_broom2.png', sm ? 15 : 30),
  showcase: (sm) => pixIcon('star', sm ? 2 : 3),
  // Sheet 119 (his picks, 2026-11-09): 12-wide icons, so 1x small and 2x big.
  omashu: (sm) => pixIcon('telly', sm ? 1 : 2),
  'botw guide': (sm) => pixIcon('map', sm ? 1 : 2),
  design: (sm) => pixIcon('palette', sm ? 1 : 2),
};
const TOPICS = {
  'top bar': () => pixIcon('bar', 2), security: () => img('art/browser/shield_rest.png', 20), tv: () => pixIcon('tv', 2),
  claude: () => pixIcon('claude', 2), notices: () => pixIcon('bell', 2), logins: () => pixIcon('key', 2), 'address bar': () => pixIcon('globe', 2),
  settings: () => pixIcon('cog', 2), 'mockups trail': () => pixIcon('log', 2), autofill: () => pixIcon('keyboard', 2), tabs: () => pixIcon('tabs', 2),
  'campfire scene': () => pixIcon('fire', 2), launcher: () => pixIcon('pad', 2), report: () => pixIcon('scroll', 2), 'title cards': () => pixIcon('star', 2),
  'all waymark': () => pixIcon('post', 2),
};
/** A project's emblem: its own logo when it has one, else Samara's art or a pixel icon, else the icon Claude named for it, else the scroll. */
export function projectIcon(name, small = false, logos = null, icon = null) {
  // His rule (2026-10-28): "if a project has a logo the logo is used". Logos are drawn art, not pixel art: smoothed.
  const logo = logos?.[name];
  if (typeof logo === 'string' && logo.startsWith('http://127.0.0.1:')) { const i = img(logo, small ? 18 : 30); i.style.imageRendering = 'auto'; i.className = 'plogo'; return i; }
  const f = PROJECTS[String(name).toLowerCase()];
  if (f) return f(small);
  if (icon === 'shield') return img('art/browser/shield_rest.png', small ? 16 : 30);
  // Its art's width decides the whole-number scale: about 30 px big (a 10-wide icon at 3x), about 20 px small.
  const one = (icon ? pixIcon(icon, 1) : null) ? icon : 'scroll';
  const w = Number(pixIcon(one, 1).getAttribute('width')) || 10;
  return pixIcon(one, Math.max(1, Math.floor((small ? 20 : 30) / w)));
}
/** A topic's icon (about 20 px): the one Claude picked for it (sheet 100 v4), else by its name. */
export function topicIcon(name, icon) {
  if (icon === 'shield') return img('art/browser/shield_rest.png', 20);
  const own = icon ? pixIcon(icon, 2) : null;
  if (own) return own;
  const f = TOPICS[String(name).toLowerCase()];
  return f ? f() : pixIcon('scroll', 2);
}
