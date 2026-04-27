import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ============================================================
// Types (inline to avoid import resolution issues in tests)
// ============================================================

type TaskStatus = 'active' | 'completed';
type TaskPriority = 'low' | 'medium' | 'high';

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

interface Document {
  id: string;
  userId: string;
  filename: string;
  storageKey: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  completionPercentage: number;
  totalDocuments: number;
  recentDocuments: Document[];
}

// ============================================================
// Pure utility functions under test
// ============================================================

function computeDashboardStats(tasks: Task[], documents: Document[]): DashboardStats {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const activeTasks = tasks.filter((t) => t.status === 'active').length;
  const completionPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const totalDocuments = documents.length;
  const recentDocuments = [...documents]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);

  return {
    totalTasks,
    completedTasks,
    activeTasks,
    completionPercentage,
    totalDocuments,
    recentDocuments,
  };
}

function validateTaskInput(input: Partial<Task>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.title || input.title.trim() === '') {
    errors.push('title is required');
  }

  if (input.priority && !['low', 'medium', 'high'].includes(input.priority)) {
    errors.push('priority must be low, medium, or high');
  }

  if (input.status && !['active', 'completed'].includes(input.status)) {
    errors.push('status must be active or completed');
  }

  if (input.dueDate) {
    const date = new Date(input.dueDate);
    if (isNaN(date.getTime())) {
      errors.push('dueDate must be a valid ISO 8601 date string');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateDocumentInput(input: {
  filename?: string;
  fileType?: string;
  fileSize?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const maxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

  if (!input.filename || input.filename.trim() === '') {
    errors.push('filename is required');
  }

  if (!input.fileType || !allowedMimeTypes.includes(input.fileType)) {
    errors.push(`fileType must be one of: ${allowedMimeTypes.join(', ')}`);
  }

  if (input.fileSize === undefined || input.fileSize === null) {
    errors.push('fileSize is required');
  } else if (input.fileSize <= 0) {
    errors.push('fileSize must be greater than 0');
  } else if (input.fileSize > maxFileSizeBytes) {
    errors.push(`fileSize must not exceed ${maxFileSizeBytes} bytes`);
  }

  return { valid: errors.length === 0, errors };
}

function buildStorageKey(userId: string, docId: string, filename: string): string {
  if (!userId || !docId || !filename) {
    throw new Error('userId, docId, and filename are all required to build a storage key');
  }
  return `${userId}/${docId}/${filename}`;
}

function filterTasks(tasks: Task[], status: TaskStatus | 'all'): Task[] {
  if (status === 'all') return tasks;
  return tasks.filter((t) => t.status === status);
}

function sortTasksByDueDate(tasks: Task[], direction: 'asc' | 'desc' = 'asc'): Task[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return direction === 'asc' ? 1 : -1;
    if (!b.dueDate) return direction === 'asc' ? -1 : 1;
    const diff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    return direction === 'asc' ? diff : -diff;
  });
}

function patchTask(existing: Task, patch: Partial<Omit<Task, 'id' | 'userId' | 'createdAt'>>): Task {
  return {
    ...existing,
    ...patch,
    id: existing.id,
    userId: existing.userId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// Mock factories
// ============================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_001',
    userId: 'user_abc',
    title: 'Schedule housing appointment',
    description: 'Call housing office at new duty station',
    dueDate: '2025-03-15',
    priority: 'high',
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc_001',
    userId: 'user_abc',
    filename: 'orders.pdf',
    storageKey: 'user_abc/doc_001/orders.pdf',
    fileType: 'application/pdf',
    fileSize: 204800,
    uploadedAt: '2025-01-10T10:00:00.000Z',
    ...overrides,
  };
}

// ============================================================
// Mock external dependencies
// ============================================================

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
const mockNanoid = jest.fn(() => 'mock_nanoid_id');

// ============================================================
// Simulated API handler helpers (thin wrappers around logic)
// ============================================================

interface MockD1Result<T> {
  results: T[];
}

interface MockD1DB {
  prepare: jest.MockedFunction<(sql: string) => MockD1Statement>;
}

interface MockD1Statement {
  bind: jest.MockedFunction<(...args: unknown[]) => MockD1Statement>;
  all: jest.MockedFunction<() => Promise<MockD1Result<unknown>>>;
  run: jest.MockedFunction<() => Promise<{ success: boolean }>>;
  first: jest.MockedFunction<() => Promise<unknown>>;
}

function createMockStatement(overrides: Partial<MockD1Statement> = {}): MockD1Statement {
  const stmt: MockD1Statement = {
    bind: jest.fn().mockReturnThis() as jest.MockedFunction<(...args: unknown[]) => MockD1Statement>,
    all: jest.fn().mockResolvedValue({ results: [] }) as jest.MockedFunction<() => Promise<MockD1Result<unknown>>>,
    run: jest.fn().mockResolvedValue({ success: true }) as jest.MockedFunction<() => Promise<{ success: boolean }>>,
    first: jest.fn().mockResolvedValue(null) as jest.MockedFunction<() => Promise<unknown>>,
    ...overrides,
  };
  return stmt;
}

function createMockDB(statementOverrides: Partial<MockD1Statement> = {}): MockD1DB {
  const stmt = createMockStatement(statementOverrides);
  return {
    prepare: jest.fn().mockReturnValue(stmt),
  };
}

// ============================================================
// Simulated service layer
// ============================================================

async function getTasksForUser(db: MockD1DB, userId: string): Promise<Task[]> {
  const stmt = db.prepare('SELECT * FROM tasks WHERE user_id = ?');
  stmt.bind(userId);
  const result = await stmt.all();
  return result.results as Task[];
}

async function createTask(
  db: MockD1DB,
  userId: string,
  input: { title: string; description?: string; dueDate?: string; priority?: TaskPriority },
  idGenerator: () => string = mockNanoid,
): Promise<Task> {
  const validation = validateTaskInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }
  const now = new Date().toISOString();
  const task: Task = {
    id: idGenerator(),
    userId,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    priority: input.priority ?? 'medium',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  const stmt = db.prepare(
    'INSERT INTO tasks (id, user_id, title, description, due_date, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  stmt.bind(task.id, task.userId, task.title, task.description, task.dueDate, task.priority, task.status, task.createdAt, task.updatedAt);
  await stmt.run();
  return task;
}

async function updateTask(
  db: MockD1DB,
  userId: string,
  taskId: string,
  patch: Partial<Omit<Task, 'id' | 'userId' | 'createdAt'>>,
): Promise<Task> {
  const fetchStmt = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?');
  fetchStmt.bind(taskId, userId);
  const existing = (await fetchStmt.first()) as Task | null;
  if (!existing) {
    throw new Error('Task not found');
  }
  const updated = patchTask(existing, patch);
  const updateStmt = db.prepare('UPDATE tasks SET title=?, status=?, updated_at=? WHERE id=? AND user_id=?');
  updateStmt.bind(updated.title, updated.status, updated.updatedAt, updated.id, updated.userId);
  await updateStmt.run();
  return updated;
}

async function deleteTask(db: MockD1DB, userId: string, taskId: string): Promise<void> {
  const fetchStmt = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?');
  fetchStmt.bind(taskId, userId);
  const existing = await fetchStmt.first();
  if (!existing) {
    throw new Error('Task not found');
  }
  const delStmt = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
  delStmt.bind(taskId, userId);
  await delStmt.run();
}

async function getDocumentsForUser(db: MockD1DB, userId: string): Promise<Document[]> {
  const stmt = db.prepare('SELECT * FROM documents WHERE user_id = ?');
  stmt.bind(userId);
  const result = await stmt.all();
  return result.results as Document[];
}

async function saveDocumentMetadata(
  db: MockD1DB,
  userId: string,
  input: { filename: string; fileType: string; fileSize: number; storageKey: string },
  idGenerator: () => string = mockNanoid,
): Promise<Document> {
  const validation = validateDocumentInput(input);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }
  const doc: Document = {
    id: idGenerator(),
    userId,
    filename: input.filename,
    storageKey: input.storageKey,
    fileType: input.fileType,
    fileSize: input.fileSize,
    uploadedAt: new Date().toISOString(),
  };
  const stmt = db.prepare('INSERT INTO documents (id, user_id, filename, storage_key, file_type, file_size, uploaded_at) VALUES (?,?,?,?,?,?,?)');
  stmt.bind(doc.id, doc.userId, doc.filename, doc.storageKey, doc.fileType, doc.fileSize, doc.uploadedAt);
  await stmt.run();
  return doc;
}

async function deleteDocument(db: MockD1DB, userId: string, docId: string): Promise<void> {
  const fetchStmt = db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?');
  fetchStmt.bind(docId, userId);
  const existing = await fetchStmt.first();
  if (!existing) {
    throw new Error('Document not found');
  }
  const delStmt = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?');
  delStmt.bind(docId, userId);
  await delStmt.run();
}

// ============================================================
// Tests
// ============================================================

describe('computeDashboardStats', () => {
  it('returns zeros when there are no tasks or documents', () => {
    const stats = computeDashboardStats([], []);
    expect(stats.totalTasks).toBe(0);
    expect(stats.completedTasks).toBe(0);
    expect(stats.activeTasks).toBe(0);
    expect(stats.completionPercentage).toBe(0);
    expect(stats.totalDocuments).toBe(0);
    expect(stats.recentDocuments).toEqual([]);
  });

  it('correctly calculates completion percentage', () => {
    const tasks = [
      makeTask({ id: '1', status: 'completed' }),
      makeTask({ id: '2', status: 'completed' }),
      makeTask({ id: '3', status: 'active' }),
      makeTask({ id: '4', status: 'active' }),
    ];
    const stats = computeDashboardStats(tasks, []);
    expect(stats.totalTasks).toBe(4);
    expect(stats.completedTasks).toBe(2);
    expect(stats.activeTasks).toBe(2);
    expect(stats.completionPercentage).toBe(50);
  });

  it('returns 100% when all tasks are completed', () => {
    const tasks = [
      makeTask({ id: '1', status: 'completed' }),
      makeTask({ id: '2', status: 'completed' }),
    ];
    const stats = computeDashboardStats(tasks, []);
    expect(stats.completionPercentage).toBe(100);
  });

  it('returns 0% when all tasks are active', () => {
    const tasks = [makeTask({ id: '1', status: 'active' }), makeTask({ id: '2', status: 'active' })];
    const stats = computeDashboardStats(tasks, []);
    expect(stats.completionPercentage).toBe(0);
  });

  it('returns the 5 most recent documents sorted by uploadedAt descending', () => {
    const docs = [
      makeDocument({ id: 'd1', uploadedAt: '2025-01-01T00:00:00.000Z' }),
      makeDocument({ id: 'd2', uploadedAt: '2025-01-06T00:00:00.000Z' }),
      makeDocument({ id: 'd3', uploadedAt: '2025-01-03T00:00:00.000Z' }),
      makeDocument({ id: 'd4', uploadedAt: '2025-01-05T00:00:00.000Z' }),
      makeDocument({ id: 'd5', uploadedAt: '2025-01-04T00:00:00.000Z' }),
      makeDocument({ id: 'd6', uploadedAt: '2025-01-02T00:00:00.000Z' }),
    ];
    const stats = computeDashboardStats([], docs);
    expect(stats.totalDocuments).toBe(6);
    expect(stats.recentDocuments).toHaveLength(5);
    expect(stats.recentDocuments[0].id).toBe('d2');
    expect(stats.recentDocuments[4].id).toBe('d6');
  });

  it('rounds completion percentage to nearest integer', () => {
    const tasks = [
      makeTask({ id: '1', status: 'completed' }),
      makeTask({ id: '2', status: 'active' }),
      makeTask({ id: '3', status: 'active' }),
    ];
    const stats = computeDashboardStats(tasks, []);
    expect(stats.completionPercentage).toBe(33);
  });
});

describe('validateTaskInput', () => {
  it('passes with valid minimal input', () => {
    const result = validateTaskInput({ title: 'My Task' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when title is missing', () => {
    const result = validateTaskInput({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title is required');
  });

  it('fails when title is empty string', () => {
    const result = validateTaskInput({ title: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('title is required');
  });

  it('fails with invalid priority', () => {
    const result = validateTaskInput({ title: 'Task', priority: 'critical' as TaskPriority });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('priority must be low, medium, or high');
  });

  it('passes with all valid priorities', () => {
    (['low', 'medium', 'high'] as TaskPriority[]).forEach((priority) => {
      const result = validateTaskInput({ title: 'Task', priority });
      expect(result.valid).toBe(true);
    });
  });

  it('fails with invalid status', () => {
    const result = validateTaskInput({ title: 'Task', status: 'pending' as TaskStatus });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('status must be active or completed');
  });

  it('passes with valid status values', () => {
    (['active', 'completed'] as TaskStatus[]).forEach((status) => {
      const result = validateTaskInput({ title: 'Task', status });
      expect(result.valid).toBe(true);
    });
  });

  it('fails with invalid dueDate format', () => {
    const result = validateTaskInput({ title: 'Task', dueDate: 'not-a-date' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('dueDate must be a valid ISO 8601 date string');
  });

  it('passes with valid ISO 8601 dueDate', () => {
    const result = validateTaskInput({ title: 'Task', dueDate: '2025-06-15' });
    expect(result.valid).toBe(true);
  });

  it('accumulates multiple errors', () => {
    const result = validateTaskInput({ priority: 'urgent' as TaskPriority, status: 'pending' as TaskStatus });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateDocumentInput', () => {
  it('passes with valid PDF input', () => {
    const result = validateDocumentInput({ filename: 'orders.pdf', fileType: 'application/pdf', fileSize: 204800 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes with valid image input', () => {
    const result = validateDocumentInput({ filename: 'photo.jpg', fileType: 'image/jpeg', fileSize: 512000 });
    expect(result.valid).toBe(true);
  });

  it('fails when filename is missing', () => {
    const result = validateDocumentInput({ fileType: 'application/pdf', fileSize: 204800 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('filename'))).toBe(true);
  });

  it('fails when filename is empty string', () => {
    const result = validateDocumentInput({ filename: '', fileType: 'application/pdf', fileSize: 204800 });
    expect(result.valid).toBe(false);
  });

  it('fails with unsupported file type', () => {
    const result = validateDocumentInput({ filename: 'doc.exe', fileType: 'application/octet-stream', fileSize: 1024 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('fileType'))).toBe(true);
  });

  it('fails when fileSize is zero', () => {
    const result = validateDocumentInput({ filename: 'doc.pdf', fileType: 'application/pdf', fileSize: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('fileSize must be greater than 0'))).toBe(true);
  });

  it('fails when fileSize exceeds 10MB', () => {
    const result = validateDocumentInput({
      filename: 'huge.pdf',
      fileType: 'application/pdf',
      fileSize: 11 * 1024 * 1024,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('fileSize must not exceed'))).toBe(true);
  });

  it('passes at exactly the 10MB limit', () => {
    const result = validateDocumentInput({
      filename: 'large.pdf',
      fileType: 'application/pdf',
      fileSize: 10 * 1024 * 1024,
    });
    expect(result.valid).toBe(true);
  });

  it('fails when fileSize is missing', () => {
    const result = validateDocumentInput({ filename: 'doc.pdf', fileType: 'application/pdf' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('fileSize is required'))).toBe(true);
  });

  it('accepts all allowed MIME types', () => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    allowed.forEach((fileType) => {
      const result = validateDocumentInput({ filename: 'file', fileType, fileSize: 1024 });
      expect(result.valid).toBe(true);
    });
  });
});

describe('buildStorageKey', () => {
  it('builds the correct key format', () => {
    const key = buildStorageKey('user_abc', 'doc_xyz', 'orders.pdf');
    expect(key).toBe('user_abc/doc_xyz/orders.pdf');
  });

  it('throws when userId is empty', () => {
    expect(() => buildStorageKey('', 'doc_xyz', 'orders.pdf')).toThrow();
  });

  it('throws when docId is empty', () => {
    expect(() => buildStorageKey('user_abc', '', 'orders.pdf')).toThrow();
  });

  it('throws when filename is empty', () => {
    expect(() => buildStorageKey('user_abc', 'doc_xyz', '')).toThrow();
  });

  it('handles filenames with spaces and special characters', () => {
    const key = buildStorageKey('user_abc', 'doc_xyz', 'my orders (2025).pdf');
    expect(key).toBe('user_abc/doc_xyz/my orders (2025).pdf');
  });
});

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: '1', status: 'active' }),
    makeTask({ id: '2', status: 'completed' }),
    makeTask({ id: '3', status: 'active' }),
    makeTask({ id: '4', status: 'completed' }),
  ];

  it('returns only active tasks when filter is active', () => {
    const result = filterTasks(tasks, 'active');
    expect(result).toHaveLength(2);
    result.forEach((t) => expect(t.status).toBe('active'));
  });

  it('returns only completed tasks when filter is completed', () => {
    const result = filterTasks(tasks, 'completed');
    expect(result).toHaveLength(2);
    result.forEach((t) => expect(t.status).toBe('completed'));
  });

  it('returns all tasks when filter is all', () => {
    const result = filterTasks(tasks, 'all');
    expect(result).toHaveLength(4);
  });

  it('returns empty array when no tasks match', () => {
    const result = filterTasks([], 'active');
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const original = [...tasks];
    filterTasks(tasks, 'active');
    expect(tasks).toEqual(original);
  });
});

describe('sortTasksByDueDate', () => {
  it('sorts tasks ascending by dueDate by default', () => {
    const tasks = [
      makeTask({ id: '1', dueDate: '2025-03-15' }),
      makeTask({ id: '2', dueDate: '2025-01-01' }),
      makeTask({ id: '3', dueDate: '2025-06-30' }),
    ];
    const sorted = sortTasksByDueDate(tasks);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
    expect(sorted[2].id).toBe('3');
  });

  it('sorts tasks descending when specified', () => {
    const tasks = [
      makeTask({ id: '1', dueDate: '2025-03-15' }),
      makeTask({ id: '2', dueDate: '2025-01-01' }),
      makeTask({ id: '3', dueDate: '2025-06-30' }),
    ];
    const sorted = sortTasksByDueDate(tasks, 'desc');
    expect(sorted[0].id).toBe('3');
    expect(sorted[1].id).toBe('1');
    expect(sorted[2].id).toBe('2');
  });

  it('places tasks without dueDate at the end in ascending sort', () => {
    const tasks = [
      makeTask({ id: '1', dueDate: undefined }),
      makeTask({ id: '2', dueDate: '2025-01-01' }),
    ];
    const sorted = sortTasksByDueDate(tasks, 'asc');
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
  });

  it('places tasks without dueDate at the end in descending sort', () => {
    const tasks = [
      makeTask({ id: '1', dueDate: undefined }),
      makeTask({ id: '2', dueDate: '2025-01-01' }),
    ];
    const sorted = sortTasksByDueDate(tasks, 'desc');
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
  });

  it('does not mutate the original array', () => {
    const tasks = [makeTask({ id: '1', dueDate: '2025-03-15' }), makeTask({ id: '2', dueDate: '2025-01-01' })];
    const original = [...tasks];
    sortTasksByDueDate(tasks);
    expect(tasks[0].id).toBe(original[0].id);
    expect(tasks[1].id).toBe(original[1].id);
  });

  it('handles empty array', () => {
    expect(sortTasksByDueDate([])).toEqual([]);
  });
});

describe('patchTask', () => {
  it('applies patch fields to existing task', () => {
    const task = makeTask({ status: 'active', title: 'Old Title' });
    const patched = patchTask(task, { status: 'completed', title: 'New Title' });
    expect(patched.status).toBe('completed');
    expect(patched.title).toBe('New Title');
  });

  it('preserves immutable fields (id, userId, createdAt)', () => {
    const task = makeTask({ id: 'task_001', userId: 'user_abc', createdAt: '2025-01-01T00:00:00.000Z' });
    const patched = patchTask(task, { title: 'Updated' });
    expect(patched.id).toBe('task_001');
    expect(patched.userId).toBe('user_abc');
    expect(patched.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('updates updatedAt to a new timestamp', () => {
    const task = makeTask({ updatedAt: '2025-01-01T00:00:00.000Z' });
    const before = Date.now();
    const patched = patchTask(task, { title: 'Changed' });
    const after = Date.now();
    const patchedTime = new Date(patched.updatedAt).getTime();
    expect(patchedTime).toBeGreaterThanOrEqual(before);
    expect(patchedTime).toBeLessThanOrEqual(after);
  });

  it('does not mutate the original task', () => {
    const task = makeTask({ title: 'Original' });
    patchTask(task, { title: 'Changed' });
    expect(task.title).toBe('Original');
  });
});

describe('getTasksForUser (service layer)', () => {
  it('queries the database with the correct user_id', async () => {
    const db = createMockDB({ all: jest.fn().mockResolvedValue({ results: [] }) });
    await getTasksForUser(db, '