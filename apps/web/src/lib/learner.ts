import { safeStorage } from './storage';

const KEY = 'blueprint.learnerId';
let cached: string | null = null;

/**
 * The prototype has no accounts: each browser gets a random learner id so
 * its history is private to it. Swapping in real auth only changes this file
 * and the server's learner resolution.
 */
export function learnerId(): string {
  if (cached) return cached;
  const existing = safeStorage.get(KEY);
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) {
    cached = existing;
    return existing;
  }
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = `learner_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  safeStorage.set(KEY, id);
  cached = id;
  return id;
}
