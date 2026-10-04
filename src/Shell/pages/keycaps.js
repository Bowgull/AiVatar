// The two switches on the comparison page actually switch, because a switch that
// does nothing cannot be judged. Nothing else on the page is interactive.
//
// aria-pressed is the thing being toggled, not a class: the look in cockpit.css
// hangs off that attribute, and so does what a screen reader says, so they
// cannot drift apart.
for (const id of ['sw1', 'sw2']) {
  const b = document.getElementById(id);
  if (!b) continue;
  b.addEventListener('click', () => {
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
}

// Did the bundled fonts actually load? Saying "if you can read this, it worked"
// is weaker than asking the browser, and a font that silently fell back to
// Arial is exactly the failure this step is meant to rule out.
if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    const want = ['Cinzel', 'Figtree', 'Silkscreen', 'PressStart2P', 'AtkinsonHyperlegible'];
    const missing = want.filter(f => !document.fonts.check(`16px "${f}"`));
    if (missing.length) {
      // On the page, not just the console: this page exists to be looked at.
      const p = document.createElement('p');
      p.className = 'plaque urgent';
      p.textContent = `These did not load, so what you see below is a substitute: ${missing.join(', ')}`;
      document.body.prepend(p);
    }
    console.log(missing.length ? `fonts missing: ${missing.join(', ')}` : 'all five fonts loaded from disk');
  });
}
