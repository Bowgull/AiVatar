# CurseForge API key: the application, ready to paste

**You asked me to apply for you. I can't submit this one** - it's an application in your name, with
your contact details, that accepts a Terms of Service on your behalf. Signing you up to an
agreement is yours to do. Everything else I can do, so here is the whole thing written out; it
should take you about two minutes.

**Where:** https://console.curseforge.com/ — sign in, then "API Keys", then apply.

---

## Why this wording matters

CurseForge refused WowUp, the most popular third-party addon manager there was, under the clause
forbidding anything that competes "directly or indirectly" with them. So the application has to be
clear that this is **not** an addon manager. It reads what is already installed, says what is out
of date, explains what each addon does, and sends you to CurseForge to download. It never
downloads, never installs, never writes to the game folder.

That is a real distinction, not a form of words: it sends traffic **to** them rather than replacing
their app. Say it plainly and do not overstate what it does.

---

## Project name

Aang

## Project description

A personal desktop assistant that runs on one machine, for one person. Among other things it helps
me keep track of my World of Warcraft addons.

I have 22 addons installed. The assistant reads the `.toc` files already on my disk to see what I
have and which version, and most of them carry their CurseForge project id. What I want the API for
is one thing: to look up the current version for a project id, so it can tell me when something I
already have has fallen behind.

It does not download addons. It does not install, update, move or delete anything in my game
folder. When something is out of date it tells me, explains what the addon does and what changed,
and opens the CurseForge page so I download it there as I do now.

The other half of what it does is explanation rather than management. I am often unsure what an
addon is for or how to configure it, and it answers questions like "what does this one actually
do", "what are the sensible settings", and "did I set that up right".

## Expected API use

Very low. One batch lookup of about 20 project ids when the assistant starts, cached. No
per-session polling, no crawling, no bulk downloads, no mirroring of your data. Read-only, and only
for projects I already have installed.

## Will this be distributed?

No. It runs on my own machine, for me. There is no public release, no user base, and no service
built on top of your infrastructure.

## Links

<your GitHub, if you want to include it - the repo is private, so a link may not help>

---

## If they say no

Nothing is wasted. Everything except the "a newer version exists" line still works without a key -
reading what you have installed, explaining what each addon does, answering "did I do it right" by
looking at your screen, and suggesting addons through the research loop. Only one of your 22
addons (BugSack) publishes on GitHub, so a GitHub-only fallback is not worth building on its own.
