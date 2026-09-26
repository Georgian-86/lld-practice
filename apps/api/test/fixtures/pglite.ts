import { PGlite } from '@electric-sql/pglite';
import type { SqlClient } from '../../src/infrastructure/postgres/sql-client';

/**
 * Real Postgres (compiled to WASM) in-process, so the Postgres adapter is
 * tested against the actual engine without a server or network.
 */
export function pgliteClient(): SqlClient {
  const db = new PGlite();
  return {
    async query(text, params) {
      if (!params || params.length === 0) {
        // Parameterless text may hold several statements (the schema); exec runs them all.
        const results = await db.exec(text);
        const last = results.at(-1);
        return { rows: (last?.rows ?? []) as Record<string, unknown>[], rowCount: last?.affectedRows ?? 0 };
      }
      const result = await db.query(text, params);
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.affectedRows ?? 0 };
    },
    end: () => db.close(),
  };
}
