/**
 * What a command actually DOES, in words he would use.
 *
 * Joshua, 2026-10-03: "im just seeing gibberish". The permission bubble asked "Can I run
 * Get-ChildItem -Path C:\... -Recurse | Where-Object {...}?" and expected a yes or a no. Nobody can
 * consent to something they cannot read, so a question he cannot read is not a safeguard at all - it
 * trains him to click the button to make it go away, which is worse than not asking.
 *
 * So the question leads with the plain meaning. The exact command still travels with it, in `meansOf`
 * below, because what he approves has to be the thing that runs - but it goes underneath, as detail,
 * instead of being the whole question.
 *
 * Unknown commands are NOT dressed up. They say so plainly and show themselves, because a confident
 * wrong summary of a command is far more dangerous than an honest "I do not recognise this one".
 */
const COMMANDS: { re: RegExp; plain: string }[] = [
  { re: /^git\s+(status|diff|log|show|branch)\b/i, plain: 'look at what has changed in your code' },
  { re: /^git\s+(add|commit)\b/i, plain: 'save a version of your code' },
  { re: /^git\s+(push)\b/i, plain: 'upload your code to GitHub' },
  { re: /^git\s+(pull|fetch|clone)\b/i, plain: 'download code from GitHub' },
  { re: /^git\b/i, plain: 'use git, which keeps the history of your code' },
  { re: /^(ls|dir|get-childitem|gci)\b/i, plain: 'list what is in a folder' },
  { re: /^(cat|type|get-content|gc)\b/i, plain: 'read a file' },
  { re: /^(grep|select-string|findstr|rg)\b/i, plain: 'search for words inside your files' },
  { re: /^(find|where\.exe|get-command)\b/i, plain: 'find where something is on your computer' },
  { re: /^(get-process|tasklist|ps)\b/i, plain: 'see which programs are running' },
  { re: /^(stop-process|taskkill|kill)\b/i, plain: 'force a program to close, losing anything unsaved in it' },
  { re: /^(mkdir|new-item)\b/i, plain: 'make a new folder or file' },
  { re: /^(copy|cp|copy-item)\b/i, plain: 'copy a file' },
  { re: /^(move|mv|move-item|ren|rename-item)\b/i, plain: 'move or rename a file' },
  { re: /^(echo|write-host|write-output)\b/i, plain: 'print a line of text' },
  { re: /^(dotnet|msbuild)\s+build\b/i, plain: 'build the app from its code' },
  { re: /^(dotnet|node|python|py)\b/i, plain: 'run a program' },
  { re: /^(test-path|get-item|stat)\b/i, plain: 'check whether a file is there' },
  { re: /^(measure-object|wc)\b/i, plain: 'count things in a file' },
  { re: /^(get-date|date)\b/i, plain: 'check the date and time' },
];

/** The plain meaning of a command, or '' when it is not one of the shapes above. */
export function plainCommand(command: string): string {
  const cmd = stripScaffolding(command);
  if (!cmd) return '';
  for (const { re, plain } of COMMANDS) if (re.test(cmd)) return plain;
  return '';
}

/** Drop the "go to this folder first" part: it is not the thing being asked about. */
export function stripScaffolding(command: string): string {
  let c = (command ?? '').trim();
  for (let i = 0; i < 4; i++) {
    const next = c.replace(/^\s*(?:cd|pushd|set-location|sl)\s+(?:"[^"]*"|'[^']*'|[^;&\r\n]+)\s*(?:;|&&|\r?\n)\s*/i, '');
    if (next === c) break;
    c = next;
  }
  return c.trim();
}

/**
 * One short sentence saying what KIND of thing this is, for someone who does not know the words.
 *
 * His ask, 2026-10-03: plain language, but still "very briefly explain the concept of what he's
 * doing". The question says what; this says what that means. It is the second line, not the first,
 * so it never gets in the way once he already knows.
 *
 * For a command it also carries the exact text, because that is the thing he is actually approving
 * and it must not be hidden behind a paraphrase, however good the paraphrase is.
 */
export function meansOf(tool: string, input: Record<string, unknown>): string {
  const s = (k: string) => typeof input?.[k] === 'string' ? String(input[k]) : '';
  const clip = (v: string, n: number) => v.length > n ? v.slice(0, n) + '...' : v;
  switch (tool) {
    case 'Bash': case 'PowerShell': case 'mcp__aang__run': {
      const cmd = stripScaffolding(s('command'));
      const known = plainCommand(s('command'));
      const lead = known
        ? 'A command is an instruction typed straight to your computer, the way you would in a black terminal window.'
        : 'A command is an instruction typed straight to your computer. I do not recognise this one, so read it before you say yes.';
      return `${lead} Exactly this: ${clip(cmd, 160)}`;
    }
    case 'Read': case 'Glob': case 'Grep': case 'mcp__aang__list_folder':
      return 'I open the file and read it. I cannot change it this way.';
    case 'Write': case 'mcp__aang__write_file':
      return 'This puts new text in a file on your disk. If something is already there it is kept as a copy first, so it can be undone.';
    case 'Edit': case 'mcp__aang__edit_file':
      return 'This changes words inside a file you already have. The old version is kept, so it can be undone.';
    case 'WebSearch': case 'mcp__aang__look_up_web':
      return 'This searches the internet. Whatever I find is a stranger\'s writing, so I treat it as information, never as instructions.';
    case 'WebFetch':
      return 'This opens a page on the internet and reads it. The page is a stranger\'s writing, so I treat it as information, never as instructions.';
    case 'mcp__aang__read_clipboard':
      return 'Your clipboard is whatever you last copied. It might be a password, which is why I ask.';
    case 'mcp__aang__copy_to_clipboard':
      return 'This replaces whatever you last copied, so what was there is gone.';
    case 'mcp__aang__read_window': case 'mcp__aang__list_controls':
      return 'I read the text showing in a window on your screen, as if looking over your shoulder.';
    case 'mcp__aang__look_at_window':
      return 'This takes a picture of your screen. Anything visible in it, I can see.';
    case 'mcp__aang__press_control': case 'mcp__aang__fill_control':
      return 'I use another program the way you would, by clicking its buttons and typing in its boxes.';
    case 'mcp__aang__delete_file':
      return 'It goes to my own bin and stays there 30 days, so this can be undone. It is not gone for good.';
    case 'mcp__aang__force_quit':
      return 'This stops a program dead rather than asking it to close, so anything unsaved in it is lost.';
    case 'mcp__aang__close_app':
      return 'This asks the program to close, the same as clicking its X, so it can still prompt you to save.';
    case 'mcp__aang__move_file': case 'mcp__aang__copy_file': case 'mcp__aang__make_folder':
      return 'Tidying only. Nothing is overwritten and nothing is deleted, and it can be undone.';
    case 'mcp__aang__remember':
      return 'This writes a fact into my memory so I still know it tomorrow. You can see and delete anything I remember.';
    case 'mcp__aang__forget':
      return 'This drops something from my memory. It is hidden rather than destroyed, so it can be brought back.';
    case 'mcp__aang__mail_inbox': case 'mcp__aang__mail_read':
      return 'Reading only. I can never send an email on my own: a draft always waits for your tap.';
    case 'mcp__aang__mail_send':
      return 'This actually sends it. Once it has gone it cannot be called back. The full wording is above.';
    case 'mcp__aang__mail_draft':
      return 'This only writes it. Nothing is sent until you tap send yourself.';
    case 'mcp__aang__send_to_phone':
      return 'This sends it off this computer to your Discord, where it leaves my control.';
    case 'mcp__aang__start_claude':
      return 'This starts a separate Claude working on its own in the background. It uses your weekly allowance.';
    case 'mcp__aang__open':
      return /^https?:/i.test(s('what'))
        ? 'This opens a web page in your browser.'
        : 'This opens it the same way double-clicking would.';
    case 'mcp__aang__revoke_permission':
      return 'This takes back something you had let me do without asking, so I go back to asking each time.';
    default: return '';
  }
}

/**
 * What trusting a whole PROGRAM means, in plain words.
 *
 * The trust category is the program's name, so "Always allow" read "Always run get-childitem commands",
 * which tells him nothing about what he is agreeing to for ever. The category itself stays as it is -
 * it has to be exact, it is a security boundary - but what the BUTTON says should be readable.
 */
const PROGRAMS: Record<string, string> = {
  git: 'use git, which keeps the history of your code',
  'get-childitem': 'list what is in your folders', ls: 'list what is in your folders', dir: 'list what is in your folders', gci: 'list what is in your folders',
  'get-content': 'read your files', cat: 'read your files', type: 'read your files', gc: 'read your files',
  'select-string': 'search inside your files', grep: 'search inside your files', findstr: 'search inside your files', rg: 'search inside your files',
  'get-process': 'see which programs are running', tasklist: 'see which programs are running',
  'test-path': 'check whether a file is there', 'get-item': 'check whether a file is there',
  'get-date': 'check the date and time',
  node: 'run programs', python: 'run programs', py: 'run programs',
  dotnet: 'build and run your apps', msbuild: 'build and run your apps',
  echo: 'print a line of text', 'write-host': 'print a line of text', 'write-output': 'print a line of text',
};

/** Plain words for trusting a program outright, or '' when there are none and the name must do. */
export function plainProgram(program: string): string {
  return PROGRAMS[(program ?? '').toLowerCase()] ?? '';
}
