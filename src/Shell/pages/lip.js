// Checks that the four rows really do differ, and that row A still matches the
// real app. Written because the whole page is worthless if two rows are
// accidentally identical, and that is invisible to the eye at these darknesses.
//
// Row A is deliberately NOT restated in lip.css - it inherits whatever .old says
// - so if Keycap.cs changes and keycaps.css is updated with it, A follows along
// and this check reports the new value rather than a stale one.

const want = {
  rA: ['rgb(201, 140, 20)', 'rgb(44, 24, 72)', 'rgb(201, 94, 40)'],
  rB: ['rgb(177, 123, 18)', 'rgb(39, 21, 63)', 'rgb(177, 83, 35)'],
  rC: ['rgb(153, 106, 15)', 'rgb(33, 18, 55)', 'rgb(153, 71, 30)'],
  rD: ['rgb(129, 90, 13)', 'rgb(28, 15, 46)', 'rgb(129, 60, 26)'],
};

const lipOf = el => {
  // The lip is the first shadow that is not inset: `0 3px 0 <colour>`.
  const parts = getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/);
  const drop = parts.find(p => !p.includes('inset')) ?? '';
  return (/rgba?\([^)]*\)/.exec(drop) ?? [''])[0];
};

const seen = {};
for (const row of Object.keys(want)) {
  const el = document.getElementById(row);
  if (!el) continue;
  seen[row] = [...el.querySelectorAll('.old')].map(lipOf);
}

const wrong = Object.keys(want).filter(r => seen[r] && String(seen[r]) !== String(want[r]));
// Two rows that render the same make the page a lie, so that is checked too.
const same = [];
const rows = Object.keys(seen);
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    if (String(seen[rows[i]]) === String(seen[rows[j]])) same.push(rows[i] + '=' + rows[j]);
  }
}

if (wrong.length || same.length) {
  const p = document.createElement('p');
  p.className = 'plaque urgent';
  p.textContent = 'This page is not showing what it says it is: '
    + (wrong.length ? `wrong rows ${wrong.join(', ')}. ` : '')
    + (same.length ? `identical rows ${same.join(', ')}.` : '');
  document.body.prepend(p);
}
console.log('lip rows:', JSON.stringify(seen, null, 1));
console.log(wrong.length || same.length ? 'ROWS ARE WRONG' : 'all four rows differ and A matches Keycap.cs');
