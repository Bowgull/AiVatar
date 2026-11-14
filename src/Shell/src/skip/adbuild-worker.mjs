// Builds the ad blocker from fresh lists away from the main process (2026-10-22): parsing 3.2 MB of lists takes ~1.8 s,
// and the main process also serves Samara's own pages, so doing it there froze the band. The engine comes back as the
// same bytes the kept copy uses (engine-cosmetic.bin), and the main process loads those in ~80 ms.
// The page tricks (resources.json) go in too (2026-11-13): an engine without them skips every `+js(...)` rule.
import { parentPort, workerData } from 'node:worker_threads';
import { FiltersEngine } from '@ghostery/adblocker';

const engine = FiltersEngine.parse(String(workerData.text ?? ''), { loadCosmeticFilters: workerData.cosmetic === true });
if (workerData.resources) engine.updateResources(String(workerData.resources), String(workerData.checksum ?? ''));
const bytes = engine.serialize();
parentPort.postMessage(bytes, [bytes.buffer]);
