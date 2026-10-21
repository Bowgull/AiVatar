// 2026-10-21: the rune's panel, alone in its see-through layer over Samara's live page (runelayer.html, browser.ts
// runeView). rune.js draws it; the Shell opens and folds it and tells it where the rune is.
import { startRune } from './rune.js';
startRune({ band: document.body, layer: true });
