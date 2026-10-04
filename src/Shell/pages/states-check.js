// Step 6.10 check page. Holds the clicked and focused states so they can be seen without a mouse,
// and prints the computed values so the comparison is numbers, not an impression.
  // The clicked and focused states, held so they can be seen without a mouse on them.
  document.getElementById('held').style.cssText = 'top:var(--lip);box-shadow:0 0 0 var(--outline),inset 0 3px 0 rgba(150,110,200,.5)';
  document.getElementById('foc').focus();
  const report = {};
  for (const [id, sel] of [['resting','.key'],['on','.key[aria-pressed="true"]'],['mini-on','.mini[aria-pressed="true"]']]) {
    const e = document.querySelector(sel); const cs = getComputedStyle(e);
    report[id] = { bg: cs.backgroundColor, top: cs.top, padLeft: cs.paddingLeft };
  }
  const gem = getComputedStyle(document.querySelector('.key[aria-pressed="true"]'), '::before');
  report.gem = { content: gem.content, w: gem.width, bg: gem.backgroundImage.slice(0, 60) };
  const f = getComputedStyle(document.getElementById('foc'));
  report.focus = { outline: f.outlineColor + ' ' + f.outlineStyle + ' ' + f.outlineWidth, offset: f.outlineOffset, top: f.top };
  console.log(JSON.stringify(report, null, 1));
