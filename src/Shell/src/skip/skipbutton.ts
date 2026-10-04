// Pressing the service's own "Skip intro" button for him.
//
// A paid service plays in its own view (6.4), so Aang cannot reach inside its player the way he can
// with a YouTube embed. What he CAN do is what a person does: watch for the service's own Skip button
// to appear, and press it.
//
// Honest about how steady each one is, because they are not equal:
//   Prime        steady. The button has carried the same class for years.
//   Crunchyroll  steady. Same.
//   Netflix      fragile, and it needs the real click path rather than .click(), because its button is
//                a React component that ignores a synthetic click. Netflix also changes its player far
//                more often than the other two.
//
// The watcher is deliberately dumb: it looks for one of a few known buttons and presses it. It does
// not read the page, does not send anything anywhere, and does nothing at all on a page with no such
// button. If a service changes its button, this stops working and nothing else breaks.

export interface ButtonRule {
  /** Which service, matched on the host. */
  host: string;
  /** What the button looks like. Tried in order. */
  selectors: string[];
  says: string;
  steady: boolean;
}

export const SKIP_BUTTONS: ButtonRule[] = [
  {
    host: 'primevideo.com',
    selectors: ['.atvwebplayersdk-skipelement-button', '.skipelement-button'],
    says: 'intro',
    steady: true,
  },
  { host: 'amazon.com', selectors: ['.atvwebplayersdk-skipelement-button'], says: 'intro', steady: true },
  { host: 'amazon.ca', selectors: ['.atvwebplayersdk-skipelement-button'], says: 'intro', steady: true },
  {
    host: 'crunchyroll.com',
    selectors: ['[data-testid="skipButton"]', '.skip-button', 'button[aria-label*="Skip" i]'],
    says: 'intro',
    steady: true,
  },
  {
    host: 'netflix.com',
    selectors: ['.watch-video--skip-content-button', '[data-uia="player-skip-intro"]'],
    says: 'intro',
    steady: false,
  },
];

/** The rules for a given address, or an empty list for a service with no known button. */
export function rulesFor(url: string): ButtonRule[] {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return []; }
  return SKIP_BUTTONS.filter(r => host === r.host || host.endsWith('.' + r.host));
}

/**
 * The watcher that runs inside the service's own page.
 *
 * Built as a string because it is injected into somebody else's page, not imported by it. Everything
 * it needs is passed in, so nothing of Aang's is exposed: it has no bridge, no preload, and no way to
 * talk back except by what it returns.
 *
 * It presses a button at most once every few seconds, so a button that reappears cannot become a loop.
 */
export function watcherFor(rule: ButtonRule): string {
  const selectors = JSON.stringify(rule.selectors);
  return `(() => {
    if (window.__aangSkipWatch) return 'already watching';
    window.__aangSkipWatch = true;
    const selectors = ${selectors};
    let lastPressed = 0;

    const press = el => {
      // Netflix's button is a React component that ignores a plain .click(), so the real mouse
      // sequence is sent instead. It is also what a person's mouse actually does.
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    };

    const look = () => {
      if (Date.now() - lastPressed < 4000) return;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        // Only a button he could actually have pressed himself: on screen, and not hidden.
        if (!el || !el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        lastPressed = Date.now();
        press(el);
        window.__aangSkipped = (window.__aangSkipped || 0) + 1;
        return;
      }
    };

    setInterval(look, 1000);
    return 'watching';
  })()`;
}
