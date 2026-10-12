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
export const isBar = (folder: string) => /^(bookmarks bar|favorites bar|favorites|bookmarks toolbar)$/i.test(folder.trim());
