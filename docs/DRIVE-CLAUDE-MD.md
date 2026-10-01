# Joshua's Drive

What is in here, where new things go, and what is not to be opened.

Written 2026-10-01 from a survey of the real contents, not from a plan. If this file and the
folders disagree, the folders are right and this file is out of date.

## What this is

Google Drive for `bocas.joshua@gmail.com`, mounted on the Shadow PC as `G:\My Drive`.
About 5.3 GB, 1,688 entries, of which **1,225 are markdown files** and 1,183 of those are in
one place (`CereBro-Vault`).

Aang reads this folder. He does not write to it.

## Not to be opened

These are refused in code, not by convention. `src/Core/src/files.ts`, `offLimits()`.

| | why |
|---|---|
| `Lindsay's Job Hunt/` | someone else's data. Joshua's instruction, explicit and permanent |
| `Lindsay Bell - CV.pdf`, `Lindsay Bell - CV.gdoc` | hers, and they sit at the top level rather than in her folder |
| any `.env` | two exist in `cerebro-machine-backup-2026-07-25/Repos/`, and they hold keys |

Anything else of hers that appears later will be caught by her full name or her email address.
`Lindz Headers`, `Lindz Birthday` and `Lindz Bday Emails` are **Joshua's own** files about her
birthday, confirmed by owner, and are readable.

## The folders

| folder | what it is |
|---|---|
| `Aang Brain/` | Five notes Aang reads at the start of every conversation: `profile.md` (who Joshua is), `learned.md`, `projects.md`, `job-search.md`, `memory.txt`. **Hand-written. Aang never writes here.** He currently reads only `profile.md` and `learned.md` |
| `Job Search 2026/` | The live job hunt. `Master Resume/` with `Previous versions/`, and `Applications/` with one folder per company (Suger, Decoda, Flexiti, MissionPerform). Each application folder holds the tailored resume, the cover letter and `Job description.txt` |
| `CereBro-Vault/` | The Obsidian vault, 1,211 files. `00_Inbox`, `01_Projects`, `02_Sources`, `07_Knowledge`. This is where almost all the markdown lives |
| `cerebro-machine-backup-2026-07-25/` | A backup of an old machine. Contains repositories, two `.env` files, and several `cerebro.db` copies. Archive: read it for history, do not treat it as current |
| `PC Transfer/`, `job-hunt-transfer/` | Moving files between machines. Transient by nature |
| `Decylne/`, `Ebusiness/`, `Sygnalist logs/`, `Posters/`, `RecipeVault_Images/`, `Carlos' Power Point/` | Older project material. Not current work |
| `Lindz Headers/` | Joshua's own design images, made for a birthday |

## Where new things go

- **A job application** goes in `Job Search 2026/Applications/<Company>/`, matching the four
  that already exist: the tailored resume, the cover letter, and `Job description.txt`.
- **A new resume version** goes in `Job Search 2026/Master Resume/`, with the one it replaces
  moved to `Previous versions/`. Date the filename, as the existing ones do
  (`Josh Bocas Resume 2026-09-29.pdf`).
- **A note or a piece of research** goes in `CereBro-Vault/00_Inbox/` to be filed later.
- **Something about Joshua that Aang should know for good** does not go in a file. It goes
  through `remember`, into his database, where it can be corrected and superseded.

## Two things to know before reading

**`.gdoc` and `.gsheet` files contain no text.** There are 71 `.gdoc` and 31 `.gsheet` files
here, and each is a 177-byte pointer holding a document id. Opening one gives a line of JSON,
not the document. Reading those needs a Drive API scope that Aang deliberately does not have.
The resume that matters exists as a real `.pdf` and `.docx` as well, so this costs little.

**Drive is streaming, not mirrored.** Files download when first opened, so a first read needs
the network and Drive running. Everything is readable; it is not instant.

## For anyone editing this file

Keep it short enough to stay true. A rules file that describes folders nobody has looked at is
worse than none, because it is believed.
