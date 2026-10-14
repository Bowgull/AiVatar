/**
 * The page readers (his ask, 2026-10-14: "pulling data that isn't plain text"). Fixed, read-only scripts written
 * here, never by a session: a session picks one by name and gets data back, never runs code of its own on a page.
 * - details: the facts a site hides in the page for Google (job pay, remote, posted date; prices; event dates)
 * - tables:  every table as clean rows
 * - images:  what pictures and charts are labelled as (alt text, captions, chart words)
 * - links:   where links really go (tracking redirects unwrapped), and which leave the site
 * Never form values (browser_check_form does that, never passwords or cards). Output is the site's words: data only.
 */
export const READERS = ['details', 'tables', 'images', 'links'] as const;
export type Reader = typeof READERS[number];
export const READER_JS = (kind: Reader, max: number) => String.raw`(() => {
  const MAX = ${Number(max)}, out = []; let size = 0;
  const add = (s) => { s = String(s).replace(/\s+/g, ' ').trim(); if (!s || size > MAX) return; size += s.length + 1; out.push(s.slice(0, 600)); };
  const kind = ${JSON.stringify(kind)};
  const flat = (v, depth) => {
    if (v == null) return '';
    if (typeof v !== 'object') return String(v);
    if (Array.isArray(v)) return v.slice(0, 6).map((x) => flat(x, depth)).filter(Boolean).join('; ');
    if (depth > 2) return v.name || v['@id'] || '';
    const bits = [];
    for (const [k, x] of Object.entries(v)) { if (k === '@context' || k === 'description' && depth > 0) continue; const s = flat(x, depth + 1); if (s) bits.push((k === '@type' ? 'type' : k) + ': ' + s); }
    return depth ? '{' + bits.join(', ') + '}' : bits.join('\n');
  };
  if (kind === 'details') {
    const things = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { const j = JSON.parse(s.textContent || ''); for (const x of [].concat(j['@graph'] || j)) things.push(x); } catch { /* broken */ } }
    for (const t of things.slice(0, 12)) {
      if (!t || typeof t !== 'object') continue;
      const c = { ...t };
      if (typeof c.description === 'string') c.description = c.description.replace(/<[^>]+>/g, ' ').slice(0, 300) + (c.description.length > 300 ? '...' : '');
      add('== ' + (Array.isArray(t['@type']) ? t['@type'].join('/') : t['@type'] || 'item') + ' =='); for (const l of flat(c, 0).split('\n')) add(l);
    }
    for (const e of [...document.querySelectorAll('[itemscope]')].slice(0, 8)) {
      const props = [...e.querySelectorAll('[itemprop]')].slice(0, 25).map((p) => p.getAttribute('itemprop') + ': ' + (p.getAttribute('content') || p.getAttribute('datetime') || p.textContent || '').trim().slice(0, 120)).filter((s) => !/: $/.test(s));
      if (props.length) { add('== ' + (e.getAttribute('itemtype') || 'item').replace(/^https?:\/\/schema\.org\//, '') + ' (on the page) =='); props.forEach(add); }
    }
    const meta = [...document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[property^="product:"], meta[name="description"]')].slice(0, 15).map((m) => (m.getAttribute('property') || m.getAttribute('name')) + ': ' + (m.getAttribute('content') || '')).filter((s) => !/image|:card|site_name|url$/.test(s));
    if (meta.length) { add('== page summary =='); meta.forEach(add); }
    if (!out.length) add('(this page hides no extra details)');
  } else if (kind === 'tables') {
    const tables = [...document.querySelectorAll('table, [role="table"], [role="grid"]')].filter((t) => !t.parentElement?.closest('table, [role="table"], [role="grid"]')).slice(0, 10);
    tables.forEach((t, i) => {
      const cap = t.querySelector('caption')?.textContent || t.getAttribute('aria-label') || '';
      add('== table ' + (i + 1) + (cap ? ': ' + cap : '') + ' ==');
      const rows = [...t.querySelectorAll('tr, [role="row"]')].slice(0, 60);
      for (const r of rows) add([...r.querySelectorAll('th, td, [role="cell"], [role="gridcell"], [role="columnheader"], [role="rowheader"]')].map((c) => (c.textContent || '').trim().replace(/\|/g, '/')).join(' | '));
      if (rows.length === 60) add('(more rows not shown)');
    });
    if (!out.length) add('(no tables on this page)');
  } else if (kind === 'images') {
    for (const im of [...document.images].filter((i) => !(i.width && i.width < 40) || Number(i.getAttribute('width')) >= 40).slice(0, 40)) { const a = im.alt || im.title || im.getAttribute('aria-label') || ''; const cap = im.closest('figure')?.querySelector('figcaption')?.textContent || ''; if (a || cap) add('picture: ' + [a, cap].filter(Boolean).join(' / ')); }
    for (const s of [...document.querySelectorAll('svg')].filter((s) => s.getBoundingClientRect().width > 120).slice(0, 8)) {
      const name = s.getAttribute('aria-label') || s.querySelector('title')?.textContent || '';
      const words = [...s.querySelectorAll('text')].map((t) => (t.textContent || '').trim()).filter(Boolean);
      if (name || words.length > 2) add('chart: ' + (name ? name + ': ' : '') + words.slice(0, 80).join(' | '));
    }
    const canv = [...document.querySelectorAll('canvas')].filter((c) => c.width > 120).length;
    if (canv) add(canv + ' drawn chart(s) or picture(s) with no words to read: only a picture (browser_picture) shows them');
    if (!out.length) add('(no labelled pictures or charts)');
  } else if (kind === 'links') {
    const here = location.hostname.replace(/^www\./, ''), seen = new Set();
    const real = (u) => { try { const x = new URL(u, location.href); for (const k of ['url', 'u', 'q', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'to']) { const v = x.searchParams.get(k); if (v && /^https?:\/\//.test(v)) return new URL(v); } return x; } catch { return null; } };
    for (const a of [...document.querySelectorAll('a[href]')].slice(0, 600)) {
      const u = real(a.getAttribute('href')); if (!u || !/^https?:$/.test(u.protocol)) continue;
      const key = u.origin + u.pathname; if (seen.has(key)) continue; seen.add(key);
      const words = (a.textContent || a.getAttribute('aria-label') || a.title || '').trim().slice(0, 80) || '(no words)';
      const host = u.hostname.replace(/^www\./, '');
      add(words + ' -> ' + (host === here ? u.pathname + (u.search ? u.search.slice(0, 60) : '') : 'LEAVES THE SITE: ' + host + u.pathname.slice(0, 80)));
      if (out.length >= 150) break;
    }
    if (!out.length) add('(no links)');
  }
  return { title: document.title, url: location.href, lines: out, more: size > MAX };
})()`;
