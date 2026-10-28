// Sheet 100 (2026-10-28, his "icons are important here too"): each project and topic of the Mockups trail wears an icon,
// Samara's own art where it has one (the lantern, the shield, the broom, Claude's mark), pixel icons for the rest.
// Matched by name, any case; a name it does not know gets the project's letter or a scroll.
import { pixIcon } from './pixicons.js';

const img = (src, size) => { const i = document.createElement('img'); i.src = src; i.alt = ''; i.width = size; i.height = size; i.style.imageRendering = 'pixelated'; return i; };
const PROJECTS = {
  samara: () => img('art/samara/samara-lantern-32.png', 32),
  'couch mode': () => pixIcon('fire', 3),
  waymark: () => pixIcon('post', 2),
  'anti-slop': () => img('art/browser/tidy_broom2.png', 30),
  'anti slop': () => img('art/browser/tidy_broom2.png', 30),
  showcase: () => pixIcon('star', 3),
};
const TOPICS = {
  'top bar': () => pixIcon('bar', 2), security: () => img('art/browser/shield_rest.png', 20), tv: () => pixIcon('tv', 2),
  claude: () => pixIcon('claude', 2), notices: () => pixIcon('bell', 2), logins: () => pixIcon('key', 2), 'address bar': () => pixIcon('globe', 2),
  settings: () => pixIcon('cog', 2), 'mockups trail': () => pixIcon('log', 2), autofill: () => pixIcon('keyboard', 2), tabs: () => pixIcon('tabs', 2),
  'campfire scene': () => pixIcon('fire', 2), launcher: () => pixIcon('pad', 2), report: () => pixIcon('scroll', 2), 'title cards': () => pixIcon('star', 2),
  'all waymark': () => pixIcon('post', 2),
};
/** A project's emblem (32 px), or its first letter in Cinzel when it has none. */
export function projectIcon(name) {
  const f = PROJECTS[String(name).toLowerCase()];
  if (f) return f();
  const b = document.createElement('b'); b.textContent = String(name).charAt(0).toUpperCase(); return b;
}
/** A topic's icon (about 20 px). */
export function topicIcon(name) {
  const f = TOPICS[String(name).toLowerCase()];
  return f ? f() : pixIcon('scroll', 2);
}
