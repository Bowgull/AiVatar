// Watch mode (his picks, 2026-11-02): a site's theater mode fills Samara's whole page area with just the player. The tab's
// own script (tabpreload.cjs) marks the player and turns `html.samara-watch` on and off; this is the look, put in by the
// Shell so a site's own rules on added styles cannot stop it. Inside the player the site's own hiding is kept (the pop-out's
// lesson, 2026-11-02: forcing every part visible put YouTube's big play button over a playing video and took his clicks).
export const WATCH_HOSTS = /(^|\.)(youtube\.com|twitch\.tv)$/i;

export const WATCH_CSS = `html.samara-watch, html.samara-watch body { overflow:hidden !important; }
html.samara-watch [data-samara-wpath] { transform:none !important; filter:none !important; contain:none !important; will-change:auto !important; perspective:none !important; backdrop-filter:none !important; }
html.samara-watch body *:not(:is([data-samara-watch], [data-samara-watch] *, [role="menu"], [role="menu"] *, [role="dialog"], [role="dialog"] *, [role="listbox"], [role="listbox"] *, .tw-balloon, .tw-balloon *, [data-a-target^="player-settings"], [data-a-target^="player-settings"] *, [data-popper-placement], [data-popper-placement] *)) { visibility:hidden !important; }
html.samara-watch :is([data-samara-watch], [role="menu"], [role="dialog"], [role="listbox"], .tw-balloon, [data-a-target^="player-settings"], [data-popper-placement]) { visibility:visible !important; }
html.samara-watch :is([role="menu"], [role="dialog"], [role="listbox"], .tw-balloon, [data-popper-placement]) { z-index:2147483647 !important; }
html.samara-watch [data-samara-watch] { position:fixed !important; left:0 !important; top:0 !important; width:100vw !important; height:100vh !important; max-width:none !important; max-height:none !important; z-index:2147483646 !important; background:#000 !important; margin:0 !important; transform:none !important; }
html.samara-watch [data-samara-watch] video { position:absolute !important; left:0 !important; top:0 !important; width:100% !important; height:100% !important; object-fit:contain !important; margin:0 !important; transform:none !important; }
html.samara-watch [data-samara-watch] .html5-video-container, html.samara-watch [data-samara-wfill] { position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; max-width:none !important; max-height:none !important; transform:none !important; }
html.samara-watch [data-samara-watch] :is(.ytp-ce-element, .ytp-cards-teaser, .ytp-paid-content-overlay) { display:none !important; }`;
