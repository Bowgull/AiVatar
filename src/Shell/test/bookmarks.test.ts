import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBar, parseBookmarks } from '../src/bookmarks.ts';

const CHROME = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://www.reddit.com/" ADD_DATE="1">Reddit</A>
        <DT><A HREF="https://www.wowhead.com/classic?a=1&amp;b=2" ADD_DATE="1">Wowhead &amp; co</A>
        <DT><H3>WoW</H3>
        <DL><p>
            <DT><A HREF="https://raider.io/">Raider.IO</A>
        </DL><p>
        <DT><A HREF="javascript:alert(1)">Bad</A>
    </DL><p>
    <DT><A HREF="https://news.ycombinator.com/">HN</A>
    <DT><A HREF="https://www.reddit.com/">Reddit again</A>
</DL><p>`;

test('Chrome export: web bookmarks with their folders, scripts and repeats dropped', () => {
  const m = parseBookmarks(CHROME);
  assert.deepEqual(m.map((x) => [x.title, x.url, x.folder]), [
    ['Reddit', 'https://www.reddit.com/', 'Bookmarks bar'],
    ['Wowhead & co', 'https://www.wowhead.com/classic?a=1&b=2', 'Bookmarks bar'],
    ['Raider.IO', 'https://raider.io/', 'WoW'],
    ['HN', 'https://news.ycombinator.com/', 'Bookmarks'],
  ].map(([t, u, f]) => [t, u, f === 'Bookmarks' ? '' : f]));
  assert.equal(isBar('Bookmarks bar'), true);
  assert.equal(isBar('WoW'), false);
});

test('2026-10-13: Chrome\'s own file and Safari\'s are read directly; the bar lands on the shelf, the Reading List does not come', async () => {
  const { parseChromeBookmarks, parseSafariBookmarks, isBar } = await import('../src/bookmarks.ts');
  const chrome = JSON.stringify({ roots: {
    bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [{ type: 'url', name: 'Wowhead', url: 'https://www.wowhead.com/' }, { type: 'folder', name: 'Games', children: [{ type: 'url', name: 'Steam', url: 'https://store.steampowered.com/' }] }] },
    other: { type: 'folder', name: 'Other', children: [{ type: 'url', name: 'Bad', url: 'javascript:alert(1)' }, { type: 'url', name: 'GitHub', url: 'https://github.com/' }] },
  } });
  const c = parseChromeBookmarks(chrome);
  assert.deepEqual(c.map(m => [m.title, m.folder]), [['Wowhead', 'Bookmarks bar'], ['Steam', 'Games'], ['GitHub', '']]);
  assert.equal(isBar(c[0]!.folder), true);
  const s = parseSafariBookmarks(JSON.stringify({ Children: [{ Title: 'BookmarksBar', Children: [{ WebBookmarkType: 'WebBookmarkTypeLeaf', URLString: 'https://a.com/', URIDictionary: { title: 'A' } }] }, { Title: 'com.apple.ReadingList', Children: [{ WebBookmarkType: 'WebBookmarkTypeLeaf', URLString: 'https://b.com/', URIDictionary: { title: 'B' } }] }] }));
  assert.deepEqual(s.map(m => m.url), ['https://a.com/']);
  assert.deepEqual(parseChromeBookmarks('not json'), []);
});
