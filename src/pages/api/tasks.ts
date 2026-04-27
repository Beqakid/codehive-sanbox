import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';

interface CloudflareEnv {
  DB: D1Database;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

type TaskStatus = 'active' | 'completed';
type TaskPriority = 'low' | 'medium' | 'high';

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

interface CreateTaskBody {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
}

interface ApiError {
  error: string;
  details?: string;
}

function mapRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    dueDate: row.due_date ?? undefined,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getDb(req: NextApiRequest): D1Database | null {
  const env = (req as NextApiRequest & { env?: CloudflareEnv }).env;
  if (env?.DB) {
    return env.DB;
  }

  const ctx = (
    req as NextApiRequest & {
      cf?: { env?: CloudflareEnv };
      context?: { env?: CloudflareEnv };
    }
  );
  if (ctx.cf?.env?.DB) return ctx.cf.env.DB;
  if (ctx.context?.env?.DB) return ctx.context.env.DB;

  return null;
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<Task[] | ApiError>,
  userId: string,
  db: D1Database
): Promise<void> {
  const { status } = req.query;

  let query = 'SELECT * FROM tasks WHERE user_id = ?';
  const bindings: unknown[] = [userId];

  if (status === 'active' || status === 'completed') {
    query += ' AND status = ?';
    bindings.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<TaskRow>();

  if (!result.success) {
    res.status(500).json({ error: 'Failed to fetch tasks', details: result.error });
    return;
  }

  const tasks = (result.results ?? []).map(mapRowToTask);
  res.status(200).json(tasks);
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse<Task | ApiError>,
  userId: string,
  db: D1Database
): Promise<void> {
  const body = req.body as CreateTaskBody;

  if (!body || typeof body.title !== 'string' || body.title.trim().length === 0) {
    res.status(400).json({ error: 'title is required and must be a non-empty string' });
    return;
  }

  const validPriorities: TaskPriority[] = ['low', 'medium', 'high'];
  const priority: TaskPriority =
    body.priority && validPriorities.includes(body.priority) ? body.priority : 'medium';

  const id = nanoid();
  const now = new Date().toISOString();
  const title = body.title.trim();
  const description = body.description?.trim() ?? null;
  const dueDate = body.dueDate ?? null;

  const result = await db
    .prepare(
      `INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .bind(id, userId, title, description, dueDate, priority, now, now)
    .run();

  if (!result.success) {
    res.status(500).json({ error: 'Failed to create task', details: result.error });
    return;
  }

  const task: Task = {
    id,
    userId,
    title,
    description: description ?? undefined,
    dueDate: dueDate ?? undefined,
    priority,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  res.status(201).json(task);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Task[] | Task | ApiError>
): Promise<void> {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = getDb(req);

  if (!db) {
    res.status(500).json({ error: 'Database not available' });
    return;
  }

  try {
    switch (req.method) {
      case 'GET':
        await handleGet(req, res as NextApiResponse<Task[] | ApiError>, userId, db);
        break;
      case 'POST':
        await handlePost(req, res as NextApiResponse<Task | ApiError>, userId, db);
        break;
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).json({ error: `Method ${req.method ?? 'unknown'} not allowed` });
    }
  } catch (err) {
    console.error('[/api/tasks] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}