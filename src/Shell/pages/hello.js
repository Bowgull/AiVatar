// The page can do exactly two things: listen, and show what it heard. It holds no connection of its
  // own, and there is no door here to ask the brain for anything.
  const lamp = document.getElementById('lamp');
  const state = document.getElementById('state');
  const seen = document.getElementById('seen');

  window.aang.onConnected(up => {
    lamp.className = 'lamp ' + (up ? 'up' : 'down');
    state.textContent = up ? 'his brain is reachable' : 'his brain is not answering';
  });

  let count = 0;
  window.aang.onMessage(m => {
    count++;
    const kind = typeof m.t === 'string' ? m.t : '?';
    seen.textContent = count + ' message' + (count === 1 ? '' : 's') + ' so far, last one: ' + kind;
  });

  window.aang.windowKind().then(k => { document.title = 'Aang: ' + k; });
