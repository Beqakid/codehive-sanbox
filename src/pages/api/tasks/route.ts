import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import { getRequestContext } from '@cloudflare/next-on-pages';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

interface D1TaskRow {
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

function rowToTask(row: D1TaskRow): Task {
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

function getDB() {
  const ctx = getRequestContext();
  const db = (ctx.env as Record<string, unknown>).DB as D1Database | undefined;
  if (!db) {
    throw new Error('D1 database binding not found. Ensure DB is bound in wrangler.toml / Cloudflare Pages settings.');
  }
  return db;
}

export const runtime = 'edge';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDB();

    const { results } = await db
      .prepare(
        `SELECT id, user_id, title, description, due_date, priority, status, created_at, updated_at
         FROM tasks
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .bind(userId)
      .all<D1TaskRow>();

    const tasks: Task[] = (results ?? []).map(rowToTask);

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (err) {
    console.error('[GET /api/tasks]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const { title, description, dueDate, priority } = body as Record<string, unknown>;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required and must be a non-empty string' }, { status: 422 });
    }

    const validPriorities: TaskPriority[] = ['low', 'medium', 'high'];
    const resolvedPriority: TaskPriority =
      typeof priority === 'string' && validPriorities.includes(priority as TaskPriority)
        ? (priority as TaskPriority)
        : 'medium';

    const resolvedDescription =
      typeof description === 'string' && description.trim().length > 0
        ? description.trim()
        : null;

    const resolvedDueDate =
      typeof dueDate === 'string' && dueDate.trim().length > 0 ? dueDate.trim() : null;

    const id = nanoid();
    const now = new Date().toISOString();

    const db = getDB();

    await db
      .prepare(
        `INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .bind(id, userId, title.trim(), resolvedDescription, resolvedDueDate, resolvedPriority, now, now)
      .run();

    const row = await db
      .prepare(
        `SELECT id, user_id, title, description, due_date, priority, status, created_at, updated_at
         FROM tasks
         WHERE id = ?`
      )
      .bind(id)
      .first<D1TaskRow>();

    if (!row) {
      return NextResponse.json({ error: 'Task created but could not be retrieved' }, { status: 500 });
    }

    return NextResponse.json({ task: rowToTask(row) }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const taskId = segments[segments.length - 1];

    if (!taskId || taskId === 'tasks') {
      return NextResponse.json(
        { error: 'Task ID is required for PATCH. Use /api/tasks/[id]' },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const db = getDB();

    const existing = await db
      .prepare(
        `SELECT id, user_id, title, description, due_date, priority, status, created_at, updated_at
         FROM tasks
         WHERE id = ? AND user_id = ?`
      )
      .bind(taskId, userId)
      .first<D1TaskRow>();

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updates = body as Record<string, unknown>;
    const setClauses: string[] = [];
    const bindings: unknown[] = [];

    if ('title' in updates) {
      if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
        return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 422 });
      }
      setClauses.push('title = ?');
      bindings.push(updates.title.trim());
    }

    if ('description' in updates) {
      const desc =
        typeof updates.description === 'string' && updates.description.trim().length > 0
          ? updates.description.trim()
          : null;
      setClauses.push('description = ?');
      bindings.push(desc);
    }

    if ('dueDate' in updates) {
      const dd =
        typeof updates.dueDate === 'string' && updates.dueDate.trim().length > 0
          ? updates.dueDate.trim()
          : null;
      setClauses.push('due_date = ?');
      bindings.push(dd);
    }

    if ('priority' in updates) {
      const validPriorities: TaskPriority[] = ['low', 'medium', 'high'];
      if (
        typeof updates.priority !== 'string' ||
        !validPriorities.includes(updates.priority as TaskPriority)
      ) {
        return NextResponse.json(
          { error: "priority must be one of 'low', 'medium', 'high'" },
          { status: 422 }
        );
      }
      setClauses.push('priority = ?');
      bindings.push(updates.priority);
    }

    if ('status' in updates) {
      const validStatuses: TaskStatus[] = ['active', 'completed'];
      if (
        typeof updates.status !== 'string' ||
        !validStatuses.includes(updates.status as TaskStatus)
      ) {
        return NextResponse.json(
          { error: "status must be one of 'active', 'completed'" },
          { status: 422 }
        );
      }
      setClauses.push('status = ?');
      bindings.push(updates.status);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    setClauses.push('updated_at = ?');
    bindings.push(now);

    bindings.push(taskId, userId);

    await db
      .prepare(
        `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`
      )
      .bind(...bindings)
      .run();

    const updated = await db
      .prepare(
        `SELECT id, user_id, title, description, due_date, priority, status, created_at, updated_at
         FROM tasks
         WHERE id = ?`
      )
      .bind(taskId)
      .first<D1TaskRow>();

    if (!updated) {
      return NextResponse.json({ error: 'Task updated but could not be retrieved' }, { status: 500 });
    }

    return NextResponse.json({ task: rowToTask(updated) }, { status: 200 });
  } catch (err) {
    console.error('[PATCH /api/tasks]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const taskId = segments[segments.length - 1];

    if (!taskId || taskId === 'tasks') {
      return NextResponse.json(
        { error: 'Task ID is required for DELETE. Use /api/tasks/[id]' },
        { status: 400 }
      );
    }

    const db = getDB();

    const existing = await db
      .prepare(`SELECT id FROM tasks WHERE id = ? AND user_id = ?`)
      .bind(taskId, userId)
      .first<{ id: string }>();

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    await db
      .prepare(`DELETE FROM tasks WHERE id = ? AND user_id = ?`)
      .bind(taskId, userId)
      .run();

    return NextResponse.json({ message: 'Task deleted successfully', id: taskId }, { status: 200 });
  } catch (err) {
    console.error('[DELETE /api/tasks]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}