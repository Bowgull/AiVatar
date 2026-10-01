# Job search state (updated 2026-10-01)

## Where things live (Google Drive, mounted on Shadow as G:\My Drive)

- **The tracker is `Job Search 2026/Job Applications Tracker`** (a Google Sheet). This is the
  source of truth for what has been applied to, when, and what came back.
  Corrected 2026-10-01: this file used to name "TALENTWELL - Discipline is a Skill", which is
  not the tracker in use. Anything that believed it went looking in the wrong place.
- **Readable mirror: `Job Search 2026/applications.md`.** The sheet itself is a `.gsheet`, which
  on disk is a 177-byte pointer holding a document id, not a spreadsheet. Nothing without a
  Google Sheets scope can read it, and Aang deliberately does not have one. The MacBook
  job-hunt skill writes that mirror after each session so the data is readable as a plain file.
  If the mirror is older than the sheet, trust the sheet and say the mirror is stale.
- **Resumes:** `Job Search 2026/Master Resume/`, with superseded ones in `Previous versions/`.
  The current resume exists as both `.pdf` and `.docx`.
- **Per-application folders:** `Job Search 2026/Applications/<Company>/`, each holding the
  tailored resume, the cover letter and `Job description.txt`. Only some applications have one;
  most were applied to through MacBook Claude Code sessions and exist only in the tracker.

## Targets

Customer Success, Operations, Systems and Automation. Toronto or remote Canada.

## How to answer a question about the job hunt

Read `applications.md` first. It carries company, role, date applied, status, pay, location,
how it was applied, and the next action. If the answer is not in there, say so rather than
guessing from folder names: the folders cover a minority of applications.

## Handoff log (newest first)

- 2026-10-01: Tracker pointer corrected. Mirror added so the data is readable without a Sheets
  scope. Drive mounted on Shadow, so these files are reachable from the desktop for the first
  time.
- 2026-09-18: Brain created. Nothing applied to via Aang yet.
