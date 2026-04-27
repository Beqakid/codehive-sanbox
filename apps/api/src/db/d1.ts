import { Env } from '../types/env';

export interface D1Env {
  DB: D1Database;
}

type QueryParams = readonly unknown[] | { [key: string]: unknown };

export interface QueryOptions<T = unknown> {
  params?: QueryParams;
  map?: (row: any) => T;
}

export class D1Client {
  private db: D1Database;

  constructor(env: D1Env | Env) {
    // Accept either a D1Env or Env (for flexibility in Hono/Cloudflare/worker environments)
    // @ts-expect-error: We expect the DB property to be present via binding/config
    this.db = env.DB;
    if (!this.db) {
      throw new Error('D1 database instance not found in environment bindings.');
    }
  }

  async query<T = unknown>(sql: string, options: QueryOptions<T> = {}): Promise<T[]> {
    const { params, map } = options;
    let stmt: D1PreparedStatement;
    try {
      stmt = this.db.prepare(sql);
    } catch (e) {
      throw new Error(`Failed to prepare SQL: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (params) {
      if (Array.isArray(params)) {
        stmt = stmt.bind(...params);
      } else {
        stmt = stmt.bind(params);
      }
    }

    let res: D1Result;
    try {
      res = await stmt.all();
    } catch (err) {
      throw new Error(`Database query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!res || !Array.isArray(res.results)) return [];

    const results = (map ? res.results.map(map) : res.results) as T[];
    return results;
  }

  async queryOne<T = unknown>(sql: string, options: QueryOptions<T> = {}): Promise<T | null> {
    const res = await this.query<T>(sql, options);
    return res.length > 0 ? res[0] : null;
  }

  async run(sql: string, params?: QueryParams): Promise<void> {
    let stmt: D1PreparedStatement;
    try {
      stmt = this.db.prepare(sql);
    } catch (e) {
      throw new Error(`Failed to prepare SQL: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (params) {
      if (Array.isArray(params)) {
        stmt = stmt.bind(...params);
      } else {
        stmt = stmt.bind(params);
      }
    }

    try {
      await stmt.run();
    } catch (err) {
      throw new Error(`Database run() failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async execTransaction<T>(
    statements: {
      sql: string;
      params?: QueryParams;
    }[],
    readOnly = false
  ): Promise<T[]> {
    // NOTE: D1 does not support transactional rollbacks as of 2024-06, but this can emulate a logical transaction
    const outputs: T[] = [];
    for (const s of statements) {
      let stmt: D1PreparedStatement;
      try {
        stmt = this.db.prepare(s.sql);
        if (s.params) {
          if (Array.isArray(s.params)) {
            stmt = stmt.bind(...s.params);
          } else {
            stmt = stmt.bind(s.params);
          }
        }
        // If readOnly, just pull results; else, run() for insert/update/delete
        if (readOnly) {
          const res = await stmt.all();
          // @ts-ignore T[] mapping logic left to caller (no .map here)
          outputs.push(res.results);
        } else {
          // @ts-ignore T usually is void for non-read ops
          outputs.push(await stmt.run());
        }
      } catch (err) {
        throw new Error(`Transaction step failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return outputs;
  }
}

// Helper for Hono context
export const getD1Client = (env: D1Env | Env): D1Client => new D1Client(env);

// Raw D1Database re-export (type only)
export type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';

export default D1Client;