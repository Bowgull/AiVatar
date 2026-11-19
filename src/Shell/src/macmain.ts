// The Mac app's front door (2026-11-19, his pick: "the secret window runs as its own program"). The same Aang.app starts
// one of two programs:
//  - normal Samara (macsamara.ts), the usual way;
//  - the secret window (secretmain.ts), when normal Samara starts it with --samara-secret on ⇧⌘N. Its own process, its own
//    data folder and single-instance lock, Now Playing and the media keys off. It talks to nothing in normal Samara.
// Nothing else happens here, so neither program carries any of the other's start-up.
import { isSecretRun } from './secretguard.ts';

if (isSecretRun(process.argv, process.platform)) await import('./secretmain.ts');
else await import('./macsamara.ts');
