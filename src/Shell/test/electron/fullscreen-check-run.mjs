// Launcher for fullscreen-check.ts: no error box ever reaches his screen. The guards go in before the check is even
// parsed, so a syntax error in it (Electron's "A JavaScript error occurred in the main process") is logged, not shown.
// Run (from src/Shell): engines/castlabs-44.5.1/electron.exe test/electron/fullscreen-check-run.mjs
import { app, dialog } from 'electron';
dialog.showErrorBox = (title, body) => console.log('HARNESS ERROR BOX ' + title + ' | ' + String(body).split('\n')[0]);
process.on('uncaughtException', (e) => { const t = String(e?.stack ?? e); console.log('HARNESS ERROR ' + t.split('\n').slice(0, 3).join(' | ')); if (!t.includes('assert(!this.paused)')) app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String(e?.stack ?? e).split('\n')[0]); });
try { await import('./fullscreen-check.ts'); }
catch (e) { console.log('HARNESS LOAD ERROR ' + String(e?.stack ?? e).split('\n').slice(0, 4).join(' | ')); app.exit(2); }
