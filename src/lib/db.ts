import { D1Database } from "@cloudflare/workers-types";
import { Task, Document, DashboardStats, TaskStatus, TaskPriority } from "./types";

// ---------------------------------------------------------------------------
// Row types returned directly from D1 (snake_case)
// ---------------------------------------------------------------------------

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

interface DocumentRow {
  id: string;
  user_id: string;
  filename: string;
  storage_key: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapTaskRow(row: TaskRow): Task {
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

function mapDocumentRow(row: DocumentRow): Document {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.filename,
    storageKey: row.storage_key,
    fileType: row.file_type,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
  };
}

// ---------------------------------------------------------------------------
// Schema initialisation (called once at startup / migration time)
// ---------------------------------------------------------------------------

export async function initSchema(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        due_date    TEXT,
        priority    TEXT NOT NULL DEFAULT 'medium',
        status      TEXT NOT NULL DEFAULT 'active',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS documents (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        filename     TEXT NOT NULL,
        storage_key  TEXT NOT NULL,
        file_type    TEXT NOT NULL,
        file_size    INTEGER NOT NULL,
        uploaded_at  TEXT NOT NULL
      )`
    )
    .run();

  // Indexes for fast per-user lookups
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`
    )
    .run();

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`
    )
    .run();
}

// ---------------------------------------------------------------------------
// Task queries
// ---------------------------------------------------------------------------

export async function getTasksByUserId(
  db: D1Database,
  userId: string
): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<TaskRow>();

  return (results ?? []).map(mapTaskRow);
}

export async function getTaskById(
  db: D1Database,
  id: string,
  userId: string
): Promise<Task | null> {
  const row = await db
    .prepare(`SELECT * FROM tasks WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<TaskRow>();

  return row ? mapTaskRow(row) : null;
}

export interface CreateTaskInput {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export async function createTask(
  db: D1Database,
  input: CreateTaskInput
): Promise<Task> {
  await db
    .prepare(
      `INSERT INTO tasks
        (id, user_id, title, description, due_date, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .bind(
      input.id,
      input.userId,
      input.title,
      input.description ?? null,
      input.dueDate ?? null,
      input.priority,
      input.createdAt,
      input.updatedAt
    )
    .run();

  const task = await getTaskById(db, input.id, input.userId);
  if (!task) throw new Error("Task creation failed: record not found after insert");
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  updatedAt: string;
}

export async function updateTask(
  db: D1Database,
  id: string,
  userId: string,
  input: UpdateTaskInput
): Promise<Task | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    fields.push("title = ?");
    values.push(input.title);
  }
  if ("description" in input) {
    fields.push("description = ?");
    values.push(input.description ?? null);
  }
  if ("dueDate" in input) {
    fields.push("due_date = ?");
    values.push(input.dueDate ?? null);
  }
  if (input.priority !== undefined) {
    fields.push("priority = ?");
    values.push(input.priority);
  }
  if (input.status !== undefined) {
    fields.push("status = ?");
    values.push(input.status);
  }

  if (fields.length === 0) {
    return getTaskById(db, id, userId);
  }

  fields.push("updated_at = ?");
  values.push(input.updatedAt);

  values.push(id, userId);

  await db
    .prepare(
      `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
    )
    .bind(...values)
    .run();

  return getTaskById(db, id, userId);
}

export async function deleteTask(
  db: D1Database,
  id: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM tasks WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Document queries
// ---------------------------------------------------------------------------

export async function getDocumentsByUserId(
  db: D1Database,
  userId: string
): Promise<Document[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC`
    )
    .bind(userId)
    .all<DocumentRow>();

  return (results ?? []).map(mapDocumentRow);
}

export async function getDocumentById(
  db: D1Database,
  id: string,
  userId: string
): Promise<Document | null> {
  const row = await db
    .prepare(`SELECT * FROM documents WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<DocumentRow>();

  return row ? mapDocumentRow(row) : null;
}

export interface CreateDocumentInput {
  id: string;
  userId: string;
  filename: string;
  storageKey: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

export async function createDocument(
  db: D1Database,
  input: CreateDocumentInput
): Promise<Document> {
  await db
    .prepare(
      `INSERT INTO documents
        (id, user_id, filename, storage_key, file_type, file_size, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.userId,
      input.filename,
      input.storageKey,
      input.fileType,
      input.fileSize,
      input.uploadedAt
    )
    .run();

  const doc = await getDocumentById(db, input.id, input.userId);
  if (!doc) throw new Error("Document creation failed: record not found after insert");
  return doc;
}

export async function deleteDocument(
  db: D1Database,
  id: string,
  userId: string
): Promise<{ deleted: boolean; storageKey: string | null }> {
  const doc = await getDocumentById(db, id, userId);
  if (!doc) return { deleted: false, storageKey: null };

  const result = await db
    .prepare(`DELETE FROM documents WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  const deleted = (result.meta?.changes ?? 0) > 0;
  return { deleted, storageKey: deleted ? doc.storageKey : null };
}

// ---------------------------------------------------------------------------
// Dashboard stats query
// ---------------------------------------------------------------------------

export async function getDashboardStats(
  db: D1Database,
  userId: string
): Promise<DashboardStats> {
  interface TaskCountRow {
    status: string;
    count: number;
  }

  const { results: taskCounts } = await db
    .prepare(
      `SELECT status, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY status`
    )
    .bind(userId)
    .all<TaskCountRow>();

  let totalTasks = 0;
  let completedTasks = 0;
  let activeTasks = 0;

  for (const row of taskCounts ?? []) {
    const count = Number(row.count);
    totalTasks += count;
    if (row.status === "completed") completedTasks += count;
    if (row.status === "active") activeTasks += count;
  }

  const completionPercentage =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  interface DocCountRow {
    count: number;
  }

  const docCountRow = await db
    .prepare(`SELECT COUNT(*) as count FROM documents WHERE user_id = ?`)
    .bind(userId)
    .first<DocCountRow>();

  const totalDocuments = Number(docCountRow?.count ?? 0);

  const { results: recentDocRows } = await db
    .prepare(
      `SELECT * FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 5`
    )
    .bind(userId)
    .all<DocumentRow>();

  const recentDocuments = (recentDocRows ?? []).map(mapDocumentRow);

  return {
    totalTasks,
    completedTasks,
    activeTasks,
    completionPercentage,
    totalDocuments,
    recentDocuments,
  };
}