// Samara's one scheduler (scheduler.ts, the scheduler engine, 2026-10-30). Every background job in Samara goes on it,
// so they all share one "he is busy" rule and one list of what runs when. boot.ts tells it where to keep catch-up times
// and what busy means (a call in Samara, a game or full screen as the brain sees it, Samara itself full screen).
import { Scheduler } from './scheduler.ts';

export const sched = new Scheduler({ log: (l) => console.log('shell: ' + l) });
