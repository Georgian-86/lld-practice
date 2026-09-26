import pg from 'pg';

export type Row = Record<string, unknown>;

/** The one thing the Postgres adapters need: run a parameterised statement. */
export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
  end(): Promise<void>;
}

/**
 * A pooled connection to a real Postgres (Supabase, Neon, RDS…). Managed
 * providers require TLS; their certificates are not in Node's store on every
 * host, so TLS is required but the chain is not pinned (standard for poolers).
 */
export function poolClient(connectionString: string): SqlClient {
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  return {
    async query(text, params) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
    },
    end: () => pool.end(),
  };
}

/** Host and database name only, for logs: never the password. */
export function describeConnection(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `postgres:${url.hostname}${url.pathname}`;
  } catch {
    return 'postgres';
  }
}
