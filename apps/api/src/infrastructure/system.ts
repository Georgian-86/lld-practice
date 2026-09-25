import { randomBytes } from 'node:crypto';
import type { Clock, IdGenerator } from '../domain/ports';

export const systemClock: Clock = { now: () => new Date() };

/** Sortable, prefixed ids: `sub_lz3k9x1a8f2c4d`. */
export const randomIds: IdGenerator = {
  next(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`;
  },
};
