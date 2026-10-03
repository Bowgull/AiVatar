// A Claude that never answers.
//
// Used by supervisor.mjs to get a turn that is genuinely IN FLIGHT without spending a single token of
// Joshua's weekly quota. The SDK spawns this where the real CLI would go; it reads whatever is sent and
// replies with nothing, so the Core sits with an active turn until its own watchdog gives up at 120s -
// which is far longer than any test needs.
//
// It must not exit, and it must not write anything to stdout that could be mistaken for a message.
process.stdin.resume();
process.stdin.on('data', () => { /* heard, ignored, deliberately */ });
// Never let an unhandled signal end this quietly in a way that looks like a reply.
process.on('SIGTERM', () => { /* the Core is being killed; that is the test */ });
setInterval(() => { /* stay alive */ }, 1 << 30);
