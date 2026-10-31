// Sheet 112's stand-in for Samara's mocklog door: a made-up tree of real sheet names, one of every mark.
const V = (n, stage) => Array.from({ length: n }, (_, i) => ({ id: 'v' + i, v: i + 1, stage: i === n - 1 ? stage : null }));
const S = (num, name, mark, fresh = false, n = 2) => ({ sheet: 'docs/cockpit/sheet-' + num + '.html', num: String(num), name, mark, fresh, versions: V(n, mark) });
const tree = { projects: [
  { name: 'Samara', count: 9, fresh: 2, topics: [
    { id: 'tabs', name: 'Tabs', icon: 'tabs', sheets: [S(110, "Claude's tabs in the list", null, true), S(111, 'Stop per tab', null, true), S(107, 'Mockups in one place', 'built', false, 3)] },
    { id: 'bar', name: 'Top bar', icon: 'bar', sheets: [S(109, 'Claude in your tabs', 'ok', false, 4), S(104, 'Pixel edges', 'fix'), S(96, 'The whole bar', null), S(94, 'Trail tidy', 'park')] },
    { id: 'bell', name: 'Notices', icon: 'bell', sheets: [S(106, 'Notices everywhere', 'built', false, 7), S(102, 'Held notices', 'ok')] },
  ], done: [] },
  { name: 'Aang', count: 2, fresh: 0, topics: [{ id: 'o', name: 'Other', sheets: [S(101, 'Aang on the Mac', 'ok'), S(105, 'Sideways marks', 'built')] }], done: [] },
] };
window.mocklog = { get: async () => tree, onData: () => {}, seen: () => {}, stage: () => {}, leave: () => {}, onEsc: () => {}, send: () => {}, where: () => {} };
