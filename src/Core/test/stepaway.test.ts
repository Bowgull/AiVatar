import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steppingAway } from '../src/away.ts';

test('"brb" and the like switch Aang to Discord; a request with it does not (2026-10-28)', () => {
  for (const t of ['brb', 'BRB', 'brb grabbing food', 'be right back', 'afk', 'gtg', 'gotta go', 'stepping away', "I'm heading out",
    'heading out for a bit', 'back in 10', 'back in 20 mins', 'be back soon', 'taking a break', 'away from my desk', 'ok brb!'])
    assert.ok(steppingAway(t), t);
  for (const t of ['brb, remind me to call the bank', 'what does brb mean?', 'heading out, can you check the weather',
    'send an email to sam then brb', 'my brother is heading out tonight to see the game with his friends from work',
    'set a timer, brb', 'hey', 'how are you'])
    assert.ok(!steppingAway(t), t);
});
