// Turning text into a vector, locally and for free.
//
// embeddinggemma runs in Ollama on this machine: 768 dimensions, measured at 42 ms warm and 0.63 GB on
// the GPU, which fits alongside a game. Every message Joshua sends can be compared against everything he
// has ever said without a single token leaving the machine. It is the half of memory that costs nothing,
// and the 148 vectors already in aang.db were made by the same model, so they line up.
//
// If Ollama is not running, this returns null and recall quietly falls back to keyword search. Memory
// getting worse is acceptable; memory breaking is not.

export const EMBED_MODEL = 'embeddinggemma';
export const EMBED_DIM = 768;
const URL = process.env.AANG_OLLAMA ?? 'http://127.0.0.1:11434';

let warnedOffline = false;

/** A vector for this text, or null if the local model is not available. */
export async function embed(text: string, timeoutMs = 8000): Promise<Float32Array | null> {
  const input = (text ?? '').trim();
  if (!input) return null;
  try {
    const res = await fetch(`${URL}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ollama returned ${res.status}`);
    const j = await res.json() as { embeddings?: number[][] };
    const v = j.embeddings?.[0];
    if (!Array.isArray(v) || v.length !== EMBED_DIM) return null;
    warnedOffline = false;
    return normalise(Float32Array.from(v));
  } catch (e) {
    if (!warnedOffline) {
      warnedOffline = true;
      console.error(`memory: local embeddings unavailable (${(e as Error).message}); falling back to keyword search`);
    }
    return null;
  }
}

/** Unit length, so a dot product is the cosine and comparisons need no extra division. */
export function normalise(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const len = Math.sqrt(sum);
  if (!len) return v;
  for (let i = 0; i < v.length; i++) v[i] /= len;
  return v;
}

/** Cosine similarity of two unit vectors. */
export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** The blob layout aang.db already uses: little-endian float32, one after another. */
export const toBlob = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
export function fromBlob(b: Uint8Array | Buffer): Float32Array {
  const copy = new Uint8Array(b).slice();            // copy: the source may not be 4-byte aligned
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}
