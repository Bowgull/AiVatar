# The secret window: where its memory lives and what protects it

His rule (2026-11-19): "i want its memory to ONLY be stored locally on my mac. It CANNOT leak anywhere and any leaks need
to be scrubbed immediately, highest order huge issue." He chose: **Mac only, and encrypted.**

## Mac only

- The PC has no secret window at all. Ctrl+Shift+N in Samara on the PC shows a small notice: "The secret window lives on
  your Mac". No secret folder, no `persist:aang-secret` profile, no file is ever made on Windows.
- Three locks make that so: `samara.ts` asks for none (`secret: false`), `boot.ts` makes one only when the machine is
  the Mac, and `AangBrowser` itself throws if asked to be a secret window anywhere but macOS (`secretguard.ts`).
- Tests: `test/boot.test.ts` ("pc: no secret window, even when the hooks ask for one") and
  `test/electron/sealdir-check.ts` part 2 (a real Electron on the PC: the browser refuses, no profile, no folder).

## Encrypted at rest (its own folder)

Everything the secret window keeps in its folder, `secret` inside Samara's data folder on the Mac (`app.getPath('userData')`, in `~/Library/Application Support`), is sealed (`sealdir.ts`):

| File | What it is |
|---|---|
| `browser-tabs.json` and `browser-tabs-kept/*` | its tabs, and the safety copies |
| `browser-history.json` | its history |
| `browser-bookmarks.json`, `browser-favicons.json`, `browser-stash.json` | bookmarks, site icons, put-away tab groups |
| `browser-downloads.json` | its downloads list (the downloaded files themselves go where he saves them) |
| `adblock-paused.json`, `site-rules.json`, `device-ok.json`, `browser-http-ok.json`, `download-trusted.json`, `browser-popups-ok.json`, `cookie-pass.json`, `cookie-kept-names.json` | its own site settings (no longer written to normal Samara's shared files) |

- **How:** AES-256-GCM, one random 32-byte key. The key is in `secret-key.json`, itself sealed with the Mac's Keychain
  (Electron safeStorage). It is opened into memory only after his PIN is right, or after his
  Mac password when he sets a new PIN. When the window locks (the mask, the Mac sleeping or locking, 15 minutes away,
  closing it), its last tab save is written and then the key is forgotten.
- **Locked means unreadable on disk:** while locked, nothing in the folder can be read, and anything that tries to write
  there is dropped instead of being written in the clear.
- **Plain files from before** are sealed the first time he unlocks after this update. Each plain copy is overwritten
  with random bytes, synced to disk, and replaced. A crash part-way is finished at the next unlock.
- **Left plain on purpose:** `secret-pin.json` (his PIN's seal, already Keychain-sealed; its PIN length is untouched),
  `secret-made.json` (a date), `secret-key.json` (Keychain-sealed), `browser-window.json` and `browser-local.json` (the
  window's size and place, the tab list's size).
- **Forgotten PIN:** holding the mask asks his Mac password in the Mac's own box (Samara never sees it); then he picks a
  new PIN and everything comes back, because the folder's key does not depend on the PIN.
- **Plainly:** the key is guarded by the Keychain plus Samara's own check of his PIN. Someone signed in as him with
  Samara running could, in principle, get Samara to open it; someone with only the disk cannot.

## What is NOT encrypted by Samara: its Chromium profile

The secret window's logged-in session is Chromium's own profile, `persist:aang-secret`, at
`Partitions/aang-secret` in the same data folder. Chromium writes it file by file and Samara
cannot seal it. It holds:

- **Cookies** (its logins). Samara's engine has cookie encryption turned off (the `EnableCookieEncryption` fuse, as on the
  PC), so they are plain on disk.
- **Site storage:** Local Storage, IndexedDB, Session Storage, service workers, the HTTP cache, code cache.
- Not its history, tabs or bookmarks: those are Samara's, in the sealed folder above.

Only **FileVault** protects that folder at rest. **FileVault is OFF on his Mac.** Until it is on, anyone with the Mac's
disk can read the secret window's cookies and site storage.

## Leaks closed (Samara QA 2026-11-19, P-2 and P-3)

| Path | Now | Test |
|---|---|---|
| shared `site-rules.json`, `adblock-paused.json`, `download-trusted.json`, `browser-http-ok.json`, `device-ok.json` | its own sealed copies | `secret-leaks.test.ts` |
| shared `cookie-pass.json`, `privacy-log.jsonl` (Claude reads it) | its own sealed copy; no privacy log at all | `secret-leaks.test.ts` |
| its paused ad sites baked into the ad engine kept in normal Samara's folder | told to its engine in memory only | `secret-leaks.test.ts` |
| a crashed or hung secret tab's site in `samara.log` | logged as "a secret tab" | `secret-leaks.test.ts` |
| typing before the PIN sent to Yandex through normal Samara's session | nothing sent before the PIN; after it, only its own session | `secret-leaks.test.ts`, `secret-check.ts` 11 |
| Now Playing (Control Center, lock screen) showing a secret tab's title | the Mac's system media controls are off for Samara | `secret-leaks.test.ts` |
| Windows media controls / the pet's NowPlaying.cs | no secret window on Windows | `boot.test.ts` |
| sync, the Claude door and history tools, Send to Aang, Ask Claude, plans | never handed to it | `boot.test.ts` ("mac: the secret window has no door out") |
| crash pictures | never taken of it | `secret-leaks.test.ts` |

Trade-off of the Now Playing fix: Chromium has no per-page switch, so on the Mac **normal Samara** also no longer shows in
Control Center's Now Playing and the keyboard's play/pause keys no longer reach Samara's videos. Aang's pet on the Mac
reads Spotify, not Samara, so Aang loses nothing.

## His last steps (only he can do these)

1. **Turn on FileVault** (System Settings > Privacy & Security > FileVault). It is the only thing protecting the secret
   window's cookies and site storage on disk, and it also covers anything the scrub could not reach.
2. **Time Machine:** if it backs up the Mac, older backups may hold the secret folder from before it was sealed. Delete
   those backups of Samara's `secret` folder, and exclude `Partitions/aang-secret` if he wants its
   cookies out of backups too.
3. **The scrub is best effort on an SSD:** APFS and the SSD may keep old copies of a file's blocks after it is
   overwritten. FileVault (step 1) is what makes those unreadable.
4. After the update reaches the Mac, unlock the secret window once with his PIN: that is when its old plain files are
   sealed. Until then they stay as they were.
