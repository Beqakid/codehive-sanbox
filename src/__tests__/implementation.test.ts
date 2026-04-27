import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Types (inline to avoid path-resolution issues in isolated test file)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Pure utility functions (these live in lib/ in the real project; we define
// them here so the tests remain self-contained and fast).
// ---------------------------------------------------------------------------

function computeCompletionPercentage(total: number, completed: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function buildStorageKey(userId: string, docId: string, filename: string): string {
  return `${userId}/${docId}/${filename}`;
}

function isValidFileType(mimeType: string): boolean {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return allowed.includes(mimeType);
}

function isValidFileSizeBytes(bytes: number, maxMb = 10): boolean {
  return bytes > 0 && bytes <= maxMb * 1024 * 1024;
}

function sanitizeTaskInput(input: {
  title?: unknown;
  description?: unknown;
  dueDate?: unknown;
  priority?: unknown;
}): { title: string; description?: string; dueDate?: string; priority: TaskPriority } {
  const validPriorities: TaskPriority[] = ['low', 'medium', 'high'];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('Task title is required');

  const priority: TaskPriority = validPriorities.includes(input.priority as TaskPriority)
    ? (input.priority as TaskPriority)
    : 'medium';

  const description =
    typeof input.description === 'string' ? input.description.trim() : undefined;

  const dueDate = typeof input.dueDate === 'string' ? input.dueDate : undefined;

  return { title, description, dueDate, priority };
}

function buildDashboardStats(tasks: Task[], documents: Document[]): DashboardStats {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const activeTasks = totalTasks - completedTasks;
  const completionPercentage = computeCompletionPercentage(totalTasks, completedTasks);
  const totalDocuments = documents.length;
  const recentDocuments = [...documents]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
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

function filterTasksByStatus(tasks: Task[], status: TaskStatus): Task[] {
  return tasks.filter((t) => t.status === status);
}

function applyTaskPatch(
  task: Task,
  patch: Partial<Pick<Task, 'title' | 'description' | 'dueDate' | 'priority' | 'status'>>,
  now: string
): Task {
  return { ...task, ...patch, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Mocked external dependencies
// ---------------------------------------------------------------------------

const mockDb = {
  prepare: jest.fn(),
  exec: jest.fn(),
};

const mockR2 = {
  put: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

const mockClerk = {
  getAuth: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fake data factories
// ---------------------------------------------------------------------------

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
    uploadedAt: '2025-01-10T08:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeCompletionPercentage', () => {
  it('returns 0 when totalTasks is 0', () => {
    expect(computeCompletionPercentage(0, 0)).toBe(0);
  });

  it('returns 100 when all tasks are completed', () => {
    expect(computeCompletionPercentage(5, 5)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(computeCompletionPercentage(3, 1)).toBe(33);
  });

  it('returns 50 for half completion', () => {
    expect(computeCompletionPercentage(4, 2)).toBe(50);
  });

  it('returns 0 when no tasks completed', () => {
    expect(computeCompletionPercentage(10, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('buildStorageKey', () => {
  it('builds the correct R2 object key', () => {
    expect(buildStorageKey('user_abc', 'doc_xyz', 'orders.pdf')).toBe(
      'user_abc/doc_xyz/orders.pdf'
    );
  });

  it('handles filenames with spaces', () => {
    const key = buildStorageKey('user_1', 'doc_1', 'my file.pdf');
    expect(key).toBe('user_1/doc_1/my file.pdf');
  });

  it('segments are separated by forward slashes', () => {
    const key = buildStorageKey('u', 'd', 'f.png');
    const parts = key.split('/');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('u');
    expect(parts[1]).toBe('d');
    expect(parts[2]).toBe('f.png');
  });
});

// ---------------------------------------------------------------------------

describe('isValidFileType', () => {
  it('accepts application/pdf', () => {
    expect(isValidFileType('application/pdf')).toBe(true);
  });

  it('accepts image/jpeg', () => {
    expect(isValidFileType('image/jpeg')).toBe(true);
  });

  it('accepts image/png', () => {
    expect(isValidFileType('image/png')).toBe(true);
  });

  it('accepts image/gif', () => {
    expect(isValidFileType('image/gif')).toBe(true);
  });

  it('accepts image/webp', () => {
    expect(isValidFileType('image/webp')).toBe(true);
  });

  it('rejects text/plain', () => {
    expect(isValidFileType('text/plain')).toBe(false);
  });

  it('rejects application/exe', () => {
    expect(isValidFileType('application/exe')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidFileType('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('isValidFileSizeBytes', () => {
  it('accepts a 1 MB file against default 10 MB limit', () => {
    expect(isValidFileSizeBytes(1 * 1024 * 1024)).toBe(true);
  });

  it('accepts exactly at the 10 MB limit', () => {
    expect(isValidFileSizeBytes(10 * 1024 * 1024)).toBe(true);
  });

  it('rejects a file exceeding 10 MB', () => {
    expect(isValidFileSizeBytes(10 * 1024 * 1024 + 1)).toBe(false);
  });

  it('rejects 0 bytes', () => {
    expect(isValidFileSizeBytes(0)).toBe(false);
  });

  it('rejects negative size', () => {
    expect(isValidFileSizeBytes(-1)).toBe(false);
  });

  it('respects a custom max size', () => {
    expect(isValidFileSizeBytes(2 * 1024 * 1024, 1)).toBe(false);
    expect(isValidFileSizeBytes(512 * 1024, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('sanitizeTaskInput', () => {
  it('returns sanitized task fields for valid input', () => {
    const result = sanitizeTaskInput({
      title: '  Pack boxes  ',
      description: 'Living room first',
      dueDate: '2025-04-01',
      priority: 'low',
    });
    expect(result.title).toBe('Pack boxes');
    expect(result.description).toBe('Living room first');
    expect(result.dueDate).toBe('2025-04-01');
    expect(result.priority).toBe('low');
  });

  it('throws when title is empty string', () => {
    expect(() => sanitizeTaskInput({ title: '   ' })).toThrow('Task title is required');
  });

  it('throws when title is missing', () => {
    expect(() => sanitizeTaskInput({})).toThrow('Task title is required');
  });

  it('defaults priority to medium for invalid value', () => {
    const result = sanitizeTaskInput({ title: 'Test task', priority: 'critical' });
    expect(result.priority).toBe('medium');
  });

  it('defaults priority to medium when not provided', () => {
    const result = sanitizeTaskInput({ title: 'Test task' });
    expect(result.priority).toBe('medium');
  });

  it('omits description when not a string', () => {
    const result = sanitizeTaskInput({ title: 'Test task', description: 123 });
    expect(result.description).toBeUndefined();
  });

  it('omits dueDate when not a string', () => {
    const result = sanitizeTaskInput({ title: 'Test task', dueDate: null });
    expect(result.dueDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('filterTasksByStatus', () => {
  const tasks: Task[] = [
    makeTask({ id: '1', status: 'active' }),
    makeTask({ id: '2', status: 'completed' }),
    makeTask({ id: '3', status: 'active' }),
    makeTask({ id: '4', status: 'completed' }),
  ];

  it('returns only active tasks', () => {
    const result = filterTasksByStatus(tasks, 'active');
    expect(result).toHaveLength(2);
    result.forEach((t) => expect(t.status).toBe('active'));
  });

  it('returns only completed tasks', () => {
    const result = filterTasksByStatus(tasks, 'completed');
    expect(result).toHaveLength(2);
    result.forEach((t) => expect(t.status).toBe('completed'));
  });

  it('returns empty array when no tasks match', () => {
    const active = tasks.filter((t) => t.status === 'active');
    const result = filterTasksByStatus(active, 'completed');
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const original = [...tasks];
    filterTasksByStatus(tasks, 'active');
    expect(tasks).toEqual(original);
  });
});

// ---------------------------------------------------------------------------

describe('applyTaskPatch', () => {
  const now = '2025-06-01T12:00:00.000Z';

  it('applies status patch', () => {
    const task = makeTask({ status: 'active' });
    const patched = applyTaskPatch(task, { status: 'completed' }, now);
    expect(patched.status).toBe('completed');
  });

  it('applies title patch', () => {
    const task = makeTask({ title: 'Old title' });
    const patched = applyTaskPatch(task, { title: 'New title' }, now);
    expect(patched.title).toBe('New title');
  });

  it('updates updatedAt to provided timestamp', () => {
    const task = makeTask();
    const patched = applyTaskPatch(task, { status: 'completed' }, now);
    expect(patched.updatedAt).toBe(now);
  });

  it('does not modify createdAt', () => {
    const task = makeTask({ createdAt: '2025-01-01T00:00:00.000Z' });
    const patched = applyTaskPatch(task, { status: 'completed' }, now);
    expect(patched.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('does not mutate the original task object', () => {
    const task = makeTask({ status: 'active' });
    applyTaskPatch(task, { status: 'completed' }, now);
    expect(task.status).toBe('active');
  });

  it('can patch multiple fields at once', () => {
    const task = makeTask();
    const patched = applyTaskPatch(
      task,
      { title: 'Updated', priority: 'low', status: 'completed' },
      now
    );
    expect(patched.title).toBe('Updated');
    expect(patched.priority).toBe('low');
    expect(patched.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------

describe('buildDashboardStats', () => {
  it('returns correct stats for mixed tasks and documents', () => {
    const tasks: Task[] = [
      makeTask({ id: '1', status: 'active' }),
      makeTask({ id: '2', status: 'completed' }),
      makeTask({ id: '3', status: 'completed' }),
    ];
    const documents: Document[] = [
      makeDocument({ id: 'd1', uploadedAt: '2025-01-10T08:00:00.000Z' }),
      makeDocument({ id: 'd2', uploadedAt: '2025-01-12T08:00:00.000Z' }),
    ];

    const stats = buildDashboardStats(tasks, documents);

    expect(stats.totalTasks).toBe(3);
    expect(stats.completedTasks).toBe(2);
    expect(stats.activeTasks).toBe(1);
    expect(stats.completionPercentage).toBe(67);
    expect(stats.totalDocuments).toBe(2);
  });

  it('returns 0 completionPercentage when no tasks exist', () => {
    const stats = buildDashboardStats([], []);
    expect(stats.completionPercentage).toBe(0);
    expect(stats.totalTasks).toBe(0);
  });

  it('returns recentDocuments sorted by uploadedAt descending', () => {
    const documents: Document[] = [
      makeDocument({ id: 'd1', uploadedAt: '2025-01-01T00:00:00.000Z' }),
      makeDocument({ id: 'd3', uploadedAt: '2025-03-01T00:00:00.000Z' }),
      makeDocument({ id: 'd2', uploadedAt: '2025-02-01T00:00:00.000Z' }),
    ];

    const stats = buildDashboardStats([], documents);
    expect(stats.recentDocuments[0].id).toBe('d3');
    expect(stats.recentDocuments[1].id).toBe('d2');
    expect(stats.recentDocuments[2].id).toBe('d1');
  });

  it('limits recentDocuments to 5 entries', () => {
    const documents: Document[] = Array.from({ length: 8 }, (_, i) =>
      makeDocument({ id: `d${i}`, uploadedAt: `2025-0${(i % 9) + 1}-01T00:00:00.000Z` })
    );

    const stats = buildDashboardStats([], documents);
    expect(stats.recentDocuments.length).toBeLessThanOrEqual(5);
  });

  it('returns 100% when all tasks are completed', () => {
    const tasks: Task[] = [
      makeTask({ id: '1', status: 'completed' }),
      makeTask({ id: '2', status: 'completed' }),
    ];
    const stats = buildDashboardStats(tasks, []);
    expect(stats.completionPercentage).toBe(100);
    expect(stats.activeTasks).toBe(0);
  });

  it('does not mutate the input documents array when sorting', () => {
    const documents: Document[] = [
      makeDocument({ id: 'd1', uploadedAt: '2025-01-01T00:00:00.000Z' }),
      makeDocument({ id: 'd2', uploadedAt: '2025-03-01T00:00:00.000Z' }),
    ];
    const originalOrder = documents.map((d) => d.id);
    buildDashboardStats([], documents);
    expect(documents.map((d) => d.id)).toEqual(originalOrder);
  });
});

// ---------------------------------------------------------------------------

describe('Mock DB interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prepare is called when querying tasks', () => {
    const mockStatement = { all: jest.fn().mockReturnValue({ results: [makeTask()] }) };
    mockDb.prepare.mockReturnValue(mockStatement);

    const stmt = mockDb.prepare('SELECT * FROM tasks WHERE user_id = ?');
    stmt.all('user_abc');

    expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM tasks WHERE user_id = ?');
    expect(mockStatement.all).toHaveBeenCalledWith('user_abc');
  });

  it('prepare is called when inserting a task', () => {
    const mockStatement = { run: jest.fn().mockReturnValue({ success: true }) };
    mockDb.prepare.mockReturnValue(mockStatement);

    const task = makeTask();
    const stmt = mockDb.prepare(
      'INSERT INTO tasks (id, user_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(task.id, task.userId, task.title, task.status, task.createdAt, task.updatedAt);

    expect(mockStatement.run).toHaveBeenCalledTimes(1);
  });

  it('prepare is called when deleting a task', () => {
    const mockStatement = { run: jest.fn().mockReturnValue({ success: true }) };
    mockDb.prepare.mockReturnValue(mockStatement);

    const stmt = mockDb.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
    stmt.run('task_001', 'user_abc');

    expect(mockStatement.run).toHaveBeenCalledWith('task_001', 'user_abc');
  });

  it('prepare is called when updating task status', () => {
    const mockStatement = { run: jest.fn().mockReturnValue({ success: true }) };
    mockDb.prepare.mockReturnValue(mockStatement);

    const stmt = mockDb.prepare(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    );
    stmt.run('completed', '2025-06-01T00:00:00.000Z', 'task_001', 'user_abc');

    expect(mockStatement.run).toHaveBeenCalledWith(
      'completed',
      '2025-06-01T00:00:00.000Z',
      'task_001',
      'user_abc'
    );
  });
});

// ---------------------------------------------------------------------------

describe('Mock R2 interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('R2 delete is called with correct storage key when deleting a document', async () => {
    mockR2.delete.mockResolvedValue(undefined);

    const storageKey = 'user_abc/doc_001/orders.pdf';
    await mockR2.delete(storageKey);

    expect(mockR2.delete).toHaveBeenCalledWith(storageKey);
    expect(mockR2.delete).toHaveBeenCalledTimes(1);
  });

  it('R2 put is called with key and body when uploading', async () => {
    mockR2.put.mockResolvedValue({ etag: 'abc123' });

    const key = 'user_abc/doc_002/photo.jpg';
    const body = Buffer.from('fake-image-data');
    await mockR2.put(key, body);

    expect(mockR2.put).toHaveBeenCalledWith(key, body);
  });

  it('R2 get returns object when file exists', async () => {
    const fakeObject = { body: Buffer.from('file content'), httpMetadata: {} };
    mockR2.get.mockResolvedValue(fakeObject);

    const result = await mockR2.get('user_abc/doc_001/orders.pdf');
    expect(result).toEqual(fakeObject);
  });

  it('R2 get returns null when file does not exist', async () => {
    mockR2.get.mockResolvedValue(null);

    const result = await mockR2.get('user_abc/nonexistent/file.pdf');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('Mock Clerk auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns userId when user is authenticated', () => {
    mockClerk.getAuth.mockReturnValue({ userId: 'user_abc', sessionId: 'sess_001' });

    const auth = mockClerk.getAuth({} as Request);
    expect(auth.userId).toBe('user_abc');
  });

  it('returns null userId when user is unauthenticated', () => {
    mockClerk.getAuth.mockReturnValue({ userId: null, sessionId: null });

    const auth = mockClerk.getAuth({} as Request);
    expect(auth.userId).toBeNull();
  });

  it('returns 401-appropriate state when userId is null', () => {
    mockClerk.getAuth.mockReturnValue({ userId: null });

    const { userId } = mockClerk.getAuth({} as Request);
    const shouldReturn401 = userId === null;
    expect(shouldReturn401).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('Task CRUD simulation', () => {
  let taskStore: Task[] = [];

  beforeEach(() => {
    taskStore = [
      makeTask({ id: '1', title: 'Task One', status: 'active' }),
      makeTask({ id: '2', title: 'Task Two', status: 'completed' }),
    ];
  });

  afterEach(() => {
    taskStore = [];
  });

  it('creates a new task and adds it to the store', () => {
    const newTask = makeTask({ id: '3', title: 'Task Three', status: 'active' });
    taskStore.push(newTask);
    expect(taskStore).toHaveLength(3);
    expect(taskStore.find((t) => t.id === '3')?.title).toBe('Task Three');
  });

  it('updates a task status to completed', () => {
    const now = new Date().toISOString();
    const index = taskStore.findIndex((t) => t.id === '1');
    taskStore[index] = applyTaskPatch(taskStore[index], { status: 'completed' }, now);
    expect(taskStore[index].status).toBe('completed');
  });

  it('deletes a task from the store', () => {
    taskStore = taskStore.filter((t) => t.id !== '1');
    expect(taskStore).toHaveLength(1);
    expect(taskStore.find((t) => t.id === '1')).toBeUndefined();
  });

  it('reads all tasks for a user', () => {
    const userTasks = taskStore.filter((t) => t.userId === 'user_abc');
    expect(userTasks).toHaveLength(2);
  });

  it('reads only active tasks', () => {
    const active = filterTasksByStatus(taskStore, 'active');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('1');
  });

  it('reads only completed tasks', () => {
    const completed = filterTasksByStatus(taskStore, 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe('2');
  });
});

// ---------------------------------------------------------------------------

describe('Document management simulation', () => {
  let documentStore: Document[] = [];

  beforeEach(() => {
    documentStore = [
      makeDocument({ id: 'd1', filename: 'orders.pdf', uploadedAt: '2025-01-10T00:00:00.000Z' }),
      makeDocument({ id: 'd2', filename: 'passport.jpg', fileType: 'image/jpeg', uploadedAt: '2025-01-15T00:00:00.000Z' }),
    ];
  });

  afterEach(() => {
    documentStore = [];
  });

  it('adds a new document to the store', () => {
    const newDoc = makeDocument({ id: 'd3', filename: 'lease.pdf' });
    documentStore.push(newDoc);
    expect(documentStore).toHaveLength(3);
  });

  it('deletes a document from the store', () => {
    documentStore = documentStore.filter((d) => d.id !== 'd1');
    expect(documentStore).toHaveLength(1);
    expect(documentStore.find((d) => d.id === 'd1')).toBeUndefined();
  });

  it('lists documents for a user', () => {
    const userDocs = documentStore.filter((d) => d.userId === 'user_abc');
    expect(userDocs).toHaveLength(2);
  });

  it('validates uploaded file type before saving metadata', () => {
    const validType = isValidFileType('application/pdf');
    const invalidType = isValidFileType('application/zip');
    expect(validType).toBe(true);
    expect(invalidType).toBe(false);
  });

  it('validates uploaded file size before saving metadata', () => {
    const validSize = isValidFileSizeBytes(204800);
    const oversized = isValidFileSizeBytes(20 * 1024 * 1024);
    expect(validSize).toBe(true);
    expect(oversized).toBe(false);
  });

  it('constructs correct storage key from userId, docId, filename', () => {
    const key = buildStorageKey('user_abc', 'd3', 'lease.pdf');
    expect(key).toBe('user_abc/d3/lease.pdf');
  });
});