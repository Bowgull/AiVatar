// Sheet 50: builds one rune chip. take A-D, state working | needs | complete. px = screen px per art pixel (2 in the band).
S50.chip = function chip(take, state, o = {}) {
  const px = o.px || 2, col = { working: S50.COL.working, needs: S50.COL.needs, complete: S50.COL.complete }[state];
  const p = state === 'complete' ? 1 : (o.p ?? .62);
  const el = document.createElement('button'); el.type = 'button';
  el.className = `rune t${take} st-${state}` + (o.on ? ' on' : '');
  el.style.setProperty('--c', col); el.style.setProperty('--u', px + 'px');
  el.title = 'Claude is working: click for the details';
  const st = document.createElement('span'); st.className = 'stone';
  const rn = S50.rune(col, px, state === 'complete' ? 'tick' : 'sun');
  if (take === 'B') st.append(S50.ring(col, p, px));
  st.append(rn);
  if (take === 'C') {
    const sh = document.createElement('i'); sh.className = 'sheen';
    const url = `url(${rn.toDataURL()})`; sh.style.webkitMaskImage = url; sh.style.maskImage = url;
    st.append(sh);
  }
  if (o.pip) { const b = document.createElement('i'); b.className = 'pip'; b.textContent = o.pip; st.append(b); }
  el.append(st);
  if (take === 'D') {
    const pl = document.createElement('span'); pl.className = 'plate';
    pl.textContent = state === 'complete' ? 'DONE' : state === 'needs' ? 'ASKS' : Math.round(p * 100) + '%';
    if (px > 2) { pl.style.fontSize = (10 * px / 2) + 'px'; pl.style.padding = `${5 * px / 2}px ${6 * px / 2}px ${4 * px / 2}px`; pl.style.borderRadius = (5 * px / 2) + 'px'; }
    el.append(pl);
  }
  return el;
};
