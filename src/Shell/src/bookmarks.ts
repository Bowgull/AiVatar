// 6.23: his bookmarks, brought over once from Chrome's own "Export bookmarks" file (the Netscape bookmark format
// every browser writes). Its own file so it is tested without Electron.
//
// The file is HIS, but what is inside it came from web pages (titles are whatever a site called itself), so it is
// read as plain data: web addresses only (http and https), titles cut short, nothing in it is ever run or loaded.

export interface Mark { title: string; url: string; folder: string }

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Every web bookmark in an exported bookmarks file, with the folder it sat in. At most `max`. */
export function parseBookmarks(html: string, max = 5000): Mark[] {
  const out: Mark[] = [];
  const seen = new Set<string>();
  const folders: string[] = [];
  // Walk the tags in order: a folder heading (<H3>) opens a level at its next <DL>, </DL> closes one.
  const re = /<H3[^>]*>([\s\S]*?)<\/H3>|<DL>|<\/DL>|<A\s([^>]*)>([\s\S]*?)<\/A>/gi;
  let pending: string | null = null;
  for (let m = re.exec(html); m && out.length < max; m = re.exec(html)) {
    const tag = m[0].slice(0, 4).toUpperCase();
    if (tag.startsWith('<H3')) { pending = decode(m[1]!.replace(/<[^>]*>/g, '')).trim(); continue; }
    if (tag === '<DL>') { folders.push(pending ?? ''); pending = null; continue; }
    if (tag === '</DL') { folders.pop(); continue; }
    const href = /HREF\s*=\s*"([^"]*)"/i.exec(m[2] ?? '')?.[1];
    if (!href) continue;
    let url: string;
    try { const u = new URL(decode(href)); if (u.protocol !== 'http:' && u.protocol !== 'https:') continue; url = u.href; } catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    const title = decode((m[3] ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim().slice(0, 200) || url;
    out.push({ title, url, folder: folders.filter(Boolean).slice(-1)[0]?.slice(0, 80) ?? '' });
  }
  return out;
}

/** Chrome calls it "Bookmarks bar", Safari "Favorites", Firefox "Bookmarks Toolbar": the ones he sees every day. */
/**
 * Chrome's own bookmarks file (JSON, in its profile folder): read directly, so he does not have to export first
 * (2026-10-13, his ask). The bar's top level gets the bar's name, so it lands on the shelf; anything in a folder keeps
 * the folder's name, as an export would.
 */
export function parseChromeBookmarks(json: string, max = 5000): Mark[] {
  const out: Mark[] = [];
  let root: any;
  try { root = JSON.parse(json)?.roots; } catch { return out; }
  const walk = (n: any, folder: string) => {
    if (!n || out.length >= max) return;
    if (n.type === 'url' && typeof n.url === 'string' && /^https?:\/\//i.test(n.url)) out.push({ title: String(n.name ?? n.url).slice(0, 300), url: n.url.slice(0, 2000), folder: folder.slice(0, 80) });
    if (Array.isArray(n.children)) for (const c of n.children) walk(c, n.type === 'folder' && n !== root?.bookmark_bar && n !== root?.other && n !== root?.synced ? String(n.name ?? '') : folder);
  };
  walk(root?.bookmark_bar, 'Bookmarks bar'); walk(root?.other, ''); walk(root?.synced, '');
  return out;
}

/** Safari's bookmarks (Bookmarks.plist, turned into JSON by macOS's own plutil). The Reading List is left out. */
export function parseSafariBookmarks(json: string, max = 5000): Mark[] {
  const out: Mark[] = [];
  let root: any;
  try { root = JSON.parse(json); } catch { return out; }
  const walk = (n: any, folder: string) => {
    if (!n || out.length >= max) return;
    if (n.WebBookmarkType === 'WebBookmarkTypeLeaf' && typeof n.URLString === 'string' && /^https?:\/\//i.test(n.URLString)) {
      out.push({ title: String(n.URIDictionary?.title ?? n.URLString).slice(0, 300), url: n.URLString.slice(0, 2000), folder: folder.slice(0, 80) });
    }
    if (Array.isArray(n.Children)) {
      if (n.Title === 'com.apple.ReadingList') return;
      const name = n.Title === 'BookmarksBar' ? 'Bookmarks bar' : n.Title === 'BookmarksMenu' || !n.Title ? folder : String(n.Title);
      for (const c of n.Children) walk(c, name);
    }
  };
  walk(root, '');
  return out;
}

export const isBar = (folder: string) => /^(bookmarks bar|favorites bar|favorites|bookmarks toolbar)$/i.test(folder.trim());
