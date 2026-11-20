// Samara's right-click menu on a page (moved out of sendtoaang.ts on 2026-11-20, phase 1 of Samara's own repo,
// docs/SAMARA-REPO-PLAN.md): what is offered for a link, a picture, selected words, a text box, or the page itself.
// Plain logic, no Electron. Sheet 62 (his pick, 2026-10-22) put "Send to Aang" first; Sheet 109 (2026-10-30) put Ask
// Claude first on a selection.

/** What a right-click could send: the words, the picture, the link, or the page (empty space). */
export type SendKind = 'words' | 'image' | 'link' | 'page' | 'snip';

const MAX_URL = 2048;
/** http and https only, and not absurdly long. Anything else (javascript:, file:, data:) becomes ''. */
function webUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  if (!s || s.length > MAX_URL) return '';
  try { const x = new URL(s); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
}

/** The parts of Electron's ContextMenuParams the menu looks at. */
export interface MenuParams {
  linkURL: string; srcURL: string; mediaType: string; selectionText: string; isEditable: boolean;
  misspelledWord: string; dictionarySuggestions: string[];
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
}
export type MenuItem = { id: string; label: string; key?: string; off?: boolean; sub?: boolean } | { sep: true };
export interface MenuHas { /** Sheet 109: Ask Claude on a selection */ ask?: boolean; send: boolean; other: string | null; popout: boolean; popVideo: boolean; canBack: boolean; pageIsWeb: boolean; /** the Mac's keys (⌘, ⌥); default: this machine's */ mac?: boolean }

/** What "Send to Aang" would send for this right-click: the words, the picture, the link, or the page (empty space). */
export function sendKindFor(p: MenuParams, pageIsWeb: boolean): SendKind | null {
  if (p.isEditable) return null;                  // a text box is his own typing: Cut / Copy / Paste, nothing to send
  if (p.selectionText.replace(/\s+/g, ' ').trim()) return 'words';
  if (p.mediaType === 'image' && /^(https?:|data:image\/)/.test(p.srcURL)) return 'image';
  if (p.linkURL && webUrl(p.linkURL)) return 'link';
  if (p.mediaType === 'none' || !p.mediaType) return pageIsWeb ? 'page' : null;
  return null;
}

/**
 * Build the right-click menu for what was clicked: a link, a picture, selected words, a text box, or the page.
 * Sheet 62 (his pick, 2026-10-22): "Send to Aang" is FIRST in every menu, with the menu's own line under it.
 */
export function pageMenuItems(p: MenuParams, has: MenuHas): MenuItem[] {
  const items: MenuItem[] = [];
  // The keys as this machine has them (his screenshot, 2026-10-30: the Mac showed CTRL C and ALT ←).
  const mac = has.mac ?? process.platform === 'darwin';
  const ctl = (k: string) => (mac ? '⌘' + k : 'CTRL ' + k);
  const sep = () => { if (items.length && !('sep' in items[items.length - 1]!)) items.push({ sep: true }); };
  const isWeb = (u: string) => Boolean(webUrl(u));
  // Sheet 109 (his pick, 2026-10-30): on a selection, Ask Claude first (its own list of chats beside it); on the PC Send
  // to Aang right under it, the two together at the top.
  const picked = sendKindFor(p, has.pageIsWeb) === 'words';
  if (has.ask && picked) items.push({ id: 'askclaude', label: 'Ask Claude', sub: true });
  if (has.send && sendKindFor(p, has.pageIsWeb)) items.push({ id: 'toaang', label: 'Send to Aang' });
  sep();
  // His picks (2026-10-20): save the link, save the picture, play in the pop-out.
  if (p.linkURL && isWeb(p.linkURL)) {
    items.push({ id: 'linktab', label: 'Open link in new tab' }, ...(has.other ? [{ id: 'linkother', label: has.other.replace('Open', 'Open link') }] : []),
      ...(has.popout ? [{ id: 'linkpop', label: 'Play in the pop-out' }] : []), { id: 'linksave', label: 'Save link' }, { id: 'linkcopy', label: 'Copy link' });
    sep();
  }
  if (p.mediaType === 'image' && p.srcURL && /^(https?:|data:image\/)/.test(p.srcURL)) { items.push({ id: 'imgsave', label: 'Save image' }, { id: 'imgcopy', label: 'Copy image' }); sep(); }
  if (p.mediaType === 'video' && has.popVideo) { items.push({ id: 'vidpop', label: 'Pop out this video' }); sep(); }
  const words = p.selectionText.replace(/\s+/g, ' ').trim();
  // A misspelled word: Chrome's suggestions first, then teach it the word.
  if (p.isEditable && p.misspelledWord) {
    const sug = p.dictionarySuggestions.slice(0, 5);
    sug.forEach((s, i) => items.push({ id: 'spell' + i, label: s }));
    if (!sug.length) items.push({ id: 'nospell', label: 'No suggestions', off: true });
    items.push({ id: 'learn', label: `Add "${p.misspelledWord.length > 20 ? p.misspelledWord.slice(0, 19) + '…' : p.misspelledWord}" to dictionary` });
    sep();
  }
  if (p.isEditable) {
    const f = p.editFlags;
    items.push({ id: 'cut', label: 'Cut', key: ctl('X'), off: !f.canCut }, { id: 'copy', label: 'Copy', key: ctl('C'), off: !f.canCopy },
      { id: 'paste', label: 'Paste', key: ctl('V'), off: !f.canPaste }, { id: 'selectall', label: 'Select all', key: ctl('A'), off: !f.canSelectAll });
    sep();
  } else if (words) {
    items.push({ id: 'copy', label: 'Copy', key: ctl('C') }, { id: 'search', label: `Search for "${words.length > 28 ? words.slice(0, 27) + '…' : words}"` });
    sep();
  }
  items.push({ id: 'back', label: 'Back', key: mac ? '⌥←' : 'ALT ←', off: !has.canBack }, { id: 'reload', label: 'Reload', key: ctl('R') });
  // His ask (2026-10-13): this page (or the link) as a full tab in Samara on the other machine.
  if (has.other && has.pageIsWeb) { sep(); items.push({ id: 'openother', label: has.other }); }
  return items;
}
