# Passkeys in Samara: the go/no-go (phase 3, 2026-11-18)

Plan: `cozy-skipping-pond.md` phase 3. The question: can Samara do real passkeys on both machines, (a) through
Chromium's own Windows Hello / Touch ID path, or (b) through `@clerk/electron-passkeys`?

**Result: NO-GO on both routes, on both machines.** Samara keeps passkeys hidden, and when a site asks for one anyway,
or Google refuses the sign-in, it offers **"Open this page in Chrome?"** (built, see the end).

## What was measured (no Windows Hello prompt was ever started)

`test/electron/passkey-probe.ts` asks the engine what it would offer a site, without starting a ceremony, on the hidden
desktop:

| Engine | `PublicKeyCredential` | platform authenticator (`isUVPAA`) | `passkeyPlatformAuthenticator` | phone (`hybridTransport`) |
|---|---|---|---|---|
| stock Electron 44.7.0 (Chrome 152.0.7977.130) | there | **false** | **false** | **false** |
| castLabs 44.5.1+wvcus (Chrome 152.0.7977.130) | there | **false** | **false** | **false** |

`certutil -csp "Microsoft Passport Key Storage Provider" -key` lists **no Windows Hello keys** for this user:
**Windows Hello is not set up on the Shadow PC.** So "false" is the honest answer, and no browser (Chrome included)
would get a Windows Hello passkey here today. Phone passkeys need Bluetooth on the PC, which a cloud PC does not have.

The October hang (`BROWSER-TESTS-2026-10-04.md` rows 6-7) fits this: with no Hello set up, Windows' own security
dialog is what waits, and the page's call never settles while it does.

## Route by route

### (a) Chromium's own path
- **PC:** Electron does pass WebAuthn to Windows (`webauthn.dll`, 10.0.26100.9278), per Clerk's docs ("Windows Hello
  works out of the box"). On this PC it has nothing to use: no Hello, no Bluetooth. **Not testable until a Windows
  Hello PIN is set up on Shadow** (Joshua's call; it would need him at the machine).
- **Mac:** Touch ID needs `app.configureWebAuthn({ touchID: { keychainAccessGroup } })` (Electron 42+) **and** the
  `keychain-access-groups` code-signing entitlement with an Apple team id (`<TEAM_ID>.<BUNDLE_ID>.webauthn`). Samara on
  the Mac is signed by "Samara on this Mac", a self-made certificate (`macupdate.ts sign_app`), with no team id and no
  provisioning profile, so macOS will not grant it. Even with it, those passkeys are device-only, not his iCloud
  Keychain ones (those need Apple's browser entitlement, granted only to real browsers by request). **No-go without a
  paid Apple developer account.**

### (b) `@clerk/electron-passkeys`
- Latest real release is still **0.0.3** (2026-06-25); everything newer is a canary/snapshot tag. Its README: "not yet
  ready for production use".
- It is built for an app signing in to **its own** site from a local page, not a browser serving every site:
  - Mac: AuthenticationServices needs `com.apple.developer.associated-domains` (`webcredentials:<host>`) for each
    site, a restricted entitlement that needs a provisioning profile. **No-go** for arbitrary sites.
  - Windows: it calls the same `webauthn.dll` as route (a), so it hits the same wall on Shadow (no Hello). It adds
    nothing over (a), plus a native module from a beta package.
- Running its native module here was not done: the session's safety check refused installing and running it, and the
  points above already decide the question.

## What was built instead (both machines)
- `tabpreload.cjs`: passkeys stay hidden (well-built sites fall back to password + code). A site that asks anyway
  (a real ask, not the quiet autofill kind) is refused at once and rings Samara (`tab:passkey`, carries nothing).
- `browser.ts passkeyWanted`: Samara reads the page's own top-frame address itself and shows **"Open this page in
  Chrome?"** ("<site> wants a passkey"), once per page. Yes = `toChrome()` (Chrome; Safari on the Mac or Edge on
  Windows if Chrome is missing).
- `browser.ts googleCheck` + `passkeys.ts googleRefused`: Google's "This browser or app may not be secure" page (its
  `/signin/rejected` address, or its words), in a tab or a sign-in popup, gets the same offer, for the service he was
  signing in to (Google's `continue`, else the page before).
- The test-only switch: `SAMARA_PASSKEY_TRY=1` lifts the hiding on `webauthn.io` only (never set in a release).

## If this is tried again
- **PC:** set up a Windows Hello PIN on Shadow (Settings > Accounts > Sign-in options), then run Samara's engine with
  `SAMARA_PASSKEY_TRY=1` on webauthn.io and try Register + Authenticate with Joshua at the machine. If it works, the
  allow path in the plan (main-process check of the top-level address, Samara's own "site wants your passkey" step,
  cancel after 60 s) becomes possible on the PC only, which breaks the "same on both machines" rule unless the Mac
  gets a team-signed build.
- **Mac:** only with a paid Apple developer account (team id + keychain access group).
- Recheck `@clerk/electron-passkeys` monthly (6.28) for a non-canary release past 0.0.3.
