import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

// Mock external dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

// ─── Inline implementations under test ───────────────────────────────────────
// Since we're testing logic in isolation, we define lightweight versions
// that mirror the real implementation contracts.

interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

interface Bookmark {
  id: string;
  user_id: string;
  url: string;
  title: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
  tags?: Tag[];
}

interface Tag {
  id: string;
  user_id: string;
  name: string;
}

interface RegisterDto {
  username: string;
  email: string;
  password: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface CreateBookmarkDto {
  url: string;
  title: string;
  description?: string;
  tag_ids?: string[];
}

interface UpdateBookmarkDto {
  url?: string;
  title?: string;
  description?: string;
  tag_ids?: string[];
}

// ─── Auth Service ─────────────────────────────────────────────────────────────

async function registerUser(
  pool: Pool,
  dto: RegisterDto
): Promise<{ id: string; username: string; email: string }> {
  const { username, email, password } = dto;

  if (!username || !email || !password) {
    throw new Error('Missing required fields');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );
  if (existing.rows.length > 0) {
    throw new Error('User already exists');
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
    [username, email, hash]
  );

  return result.rows[0];
}

async function loginUser(
  pool: Pool,
  dto: LoginDto,
  jwtSecret: string
): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
  const { email, password } = dto;

  if (!email || !password) {
    throw new Error('Missing required fields');
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    throw new Error('Invalid credentials');
  }

  const user: User = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, {
    expiresIn: '7d',
  });

  const { password_hash, ...safeUser } = user;
  return { token, user: safeUser };
}

function verifyToken(token: string, jwtSecret: string): { userId: string; email: string } {
  try {
    return jwt.verify(token, jwtSecret) as { userId: string; email: string };
  } catch {
    throw new Error('Invalid or expired token');
  }
}

// ─── Bookmark Service ─────────────────────────────────────────────────────────

async function createBookmark(
  pool: Pool,
  userId: string,
  dto: CreateBookmarkDto
): Promise<Bookmark> {
  const { url, title, description, tag_ids } = dto;

  if (!url || !title) {
    throw new Error('URL and title are required');
  }

  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  const result = await pool.query(
    `INSERT INTO bookmarks (user_id, url, title, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, url, title, description ?? null]
  );

  const bookmark: Bookmark = result.rows[0];

  if (tag_ids && tag_ids.length > 0) {
    for (const tagId of tag_ids) {
      await pool.query(
        'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [bookmark.id, tagId]
      );
    }
  }

  return bookmark;
}

async function getBookmarks(
  pool: Pool,
  userId: string,
  options: { search?: string; tag_id?: string; page?: number; limit?: number }
): Promise<{ data: Bookmark[]; total: number }> {
  const { search, tag_id, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;
  const params: unknown[] = [userId];
  const conditions: string[] = ['b.user_id = $1'];

  if (search) {
    params.push(search);
    conditions.push(
      `to_tsvector('english', b.title || ' ' || COALESCE(b.description, '')) @@ plainto_tsquery('english', $${params.length})`
    );
  }

  if (tag_id) {
    params.push(tag_id);
    conditions.push(
      `EXISTS (SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id AND bt.tag_id = $${params.length})`
    );
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM bookmarks b WHERE ${whereClause}`,
    params
  );

  params.push(limit, offset);
  const dataResult = await pool.query(
    `SELECT b.*, COALESCE(json_agg(t) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE ${whereClause}
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    data: dataResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

async function getBookmarkById(
  pool: Pool,
  userId: string,
  bookmarkId: string
): Promise<Bookmark | null> {
  const result = await pool.query(
    `SELECT b.*, COALESCE(json_agg(t) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE b.id = $1 AND b.user_id = $2
     GROUP BY b.id`,
    [bookmarkId, userId]
  );

  return result.rows[0] ?? null;
}

async function updateBookmark(
  pool: Pool,
  userId: string,
  bookmarkId: string,
  dto: UpdateBookmarkDto
): Promise<Bookmark> {
  const existing = await pool.query(
    'SELECT id FROM bookmarks WHERE id = $1 AND user_id = $2',
    [bookmarkId, userId]
  );

  if (existing.rows.length === 0) {
    throw new Error('Bookmark not found');
  }

  const { url, title, description, tag_ids } = dto;
  const updates: string[] = [];
  const params: unknown[] = [];

  if (url !== undefined) {
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }
    params.push(url);
    updates.push(`url = $${params.length}`);
  }
  if (title !== undefined) {
    params.push(title);
    updates.push(`title = $${params.length}`);
  }
  if (description !== undefined) {
    params.push(description);
    updates.push(`description = $${params.length}`);
  }

  updates.push(`updated_at = NOW()`);
  params.push(bookmarkId, userId);

  const result = await pool.query(
    `UPDATE bookmarks SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );

  if (tag_ids !== undefined) {
    await pool.query('DELETE FROM bookmark_tags WHERE bookmark_id = $1', [bookmarkId]);
    for (const tagId of tag_ids) {
      await pool.query(
        'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [bookmarkId, tagId]
      );
    }
  }

  return result.rows[0];
}

async function deleteBookmark(
  pool: Pool,
  userId: string,
  bookmarkId: string
): Promise<void> {
  const result = await pool.query(
    'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
    [bookmarkId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Bookmark not found');
  }
}

// ─── Tag Service ──────────────────────────────────────────────────────────────

async function createTag(pool: Pool, userId: string, name: string): Promise<Tag> {
  if (!name || name.trim().length === 0) {
    throw new Error('Tag name is required');
  }

  const existing = await pool.query(
    'SELECT id FROM tags WHERE user_id = $1 AND name = $2',
    [userId, name.trim()]
  );

  if (existing.rows.length > 0) {
    throw new Error('Tag already exists');
  }

  const result = await pool.query(
    'INSERT INTO tags (user_id, name) VALUES ($1, $2) RETURNING *',
    [userId, name.trim()]
  );

  return result.rows[0];
}

async function getTags(pool: Pool, userId: string): Promise<Tag[]> {
  const result = await pool.query(
    'SELECT * FROM tags WHERE user_id = $1 ORDER BY name ASC',
    [userId]
  );
  return result.rows;
}

async function deleteTag(pool: Pool, userId: string, tagId: string): Promise<void> {
  const result = await pool.query(
    'DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id',
    [tagId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Tag not found');
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth Service', () => {
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    jest.clearAllMocks();
  });

  // ── registerUser ────────────────────────────────────────────────────────────

  describe('registerUser', () => {
    it('should register a new user and return safe fields', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // no existing user
        .mockResolvedValueOnce({
          rows: [{ id: 'uuid-1', username: 'alice', email: 'alice@example.com' }],
        });

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      const result = await registerUser(pool, {
        username: 'alice',
        email: 'alice@example.com',
        password: 'secret123',
      });

      expect(result).toEqual({ id: 'uuid-1', username: 'alice', email: 'alice@example.com' });
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('secret123', 10);
    });

    it('should throw if username or email is missing', async () => {
      await expect(
        registerUser(pool, { username: '', email: 'a@b.com', password: 'pass123' })
      ).rejects.toThrow('Missing required fields');
    });

    it('should throw if email format is invalid', async () => {
      await expect(
        registerUser(pool, { username: 'bob', email: 'not-an-email', password: 'pass123' })
      ).rejects.toThrow('Invalid email format');
    });

    it('should throw if password is too short', async () => {
      await expect(
        registerUser(pool, { username: 'bob', email: 'bob@example.com', password: '123' })
      ).rejects.toThrow('Password must be at least 6 characters');
    });

    it('should throw if user already exists', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

      await expect(
        registerUser(pool, { username: 'alice', email: 'alice@example.com', password: 'pass123' })
      ).rejects.toThrow('User already exists');
    });

    it('should hash the password before storing', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-2', username: 'bob', email: 'bob@x.com' }] });

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('bcrypt_hash');

      await registerUser(pool, { username: 'bob', email: 'bob@x.com', password: 'mypassword' });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('mypassword', 10);
      const insertCall = (pool.query as jest.Mock).mock.calls[1];
      expect(insertCall[1]).toContain('bcrypt_hash');
    });
  });

  // ── loginUser ───────────────────────────────────────────────────────────────

  describe('loginUser', () => {
    const jwtSecret = 'test_secret';
    const mockUser: User = {
      id: 'uuid-1',
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hashed',
      created_at: new Date('2024-01-01'),
    };

    it('should return a token and safe user on valid credentials', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockedJwt.sign as jest.Mock).mockReturnValue('signed.jwt.token');

      const result = await loginUser(pool, { email: 'alice@example.com', password: 'secret' }, jwtSecret);

      expect(result.token).toBe('signed.jwt.token');
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.user.email).toBe('alice@example.com');
    });

    it('should throw if user does not exist', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        loginUser(pool, { email: 'nobody@example.com', password: 'pass' }, jwtSecret)
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw if password does not match', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        loginUser(pool, { email: 'alice@example.com', password: 'wrongpass' }, jwtSecret)
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw if email or password is missing', async () => {
      await expect(
        loginUser(pool, { email: '', password: 'pass' }, jwtSecret)
      ).rejects.toThrow('Missing required fields');

      await expect(
        loginUser(pool, { email: 'a@b.com', password: '' }, jwtSecret)
      ).rejects.toThrow('Missing required fields');
    });

    it('should sign JWT with userId and email', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockedJwt.sign as jest.Mock).mockReturnValue('token');

      await loginUser(pool, { email: 'alice@example.com', password: 'secret' }, jwtSecret);

      expect(mockedJwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, email: mockUser.email },
        jwtSecret,
        { expiresIn: '7d' }
      );
    });
  });

  // ── verifyToken ─────────────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('should return decoded payload for valid token', () => {
      const payload = { userId: 'uuid-1', email: 'alice@example.com' };
      (mockedJwt.verify as jest.Mock).mockReturnValue(payload);

      const result = verifyToken('valid.token', 'secret');

      expect(result).toEqual(payload);
    });

    it('should throw for invalid or expired token', () => {
      (mockedJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      expect(() => verifyToken('bad.token', 'secret')).toThrow('Invalid or expired token');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bookmark Service', () => {
  let pool: Pool;
  const userId = 'user-uuid-1';
  const bookmarkId = 'bm-uuid-1';

  const mockBookmark: Bookmark = {
    id: bookmarkId,
    user_id: userId,
    url: 'https://example.com',
    title: 'Example',
    description: 'An example site',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    tags: [],
  };

  beforeEach(() => {
    pool = new Pool();
    jest.clearAllMocks();
  });

  // ── createBookmark ──────────────────────────────────────────────────────────

  describe('createBookmark', () => {
    it('should create a bookmark and return it', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockBookmark] });

      const result = await createBookmark(pool, userId, {
        url: 'https://example.com',
        title: 'Example',
        description: 'An example site',
      });

      expect(result).toEqual(mockBookmark);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should associate tag_ids after insertion', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockBookmark] })
        .mockResolvedValueOnce({ rows: [] }) // tag insert 1
        .mockResolvedValueOnce({ rows: [] }); // tag insert 2

      await createBookmark(pool, userId, {
        url: 'https://example.com',
        title: 'Example',
        tag_ids: ['tag-1', 'tag-2'],
      });

      expect(pool.query).toHaveBeenCalledTimes(3);
    });

    it('should throw if url is missing', async () => {
      await expect(
        createBookmark(pool, userId, { url: '', title: 'No URL' })
      ).rejects.toThrow('URL and title are required');
    });

    it('should throw if title is missing', async () => {
      await expect(
        createBookmark(pool, userId, { url: 'https://example.com', title: '' })
      ).rejects.toThrow('URL and title are required');
    });

    it('should throw if url format is invalid', async () => {
      await expect(
        createBookmark(pool, userId, { url: 'not-a-url', title: 'Bad URL' })
      ).rejects.toThrow('Invalid URL format');
    });

    it('should handle no tag_ids gracefully (no extra queries)', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockBookmark] });

      await createBookmark(pool, userId, {
        url: 'https://example.com',
        title: 'Example',
      });

      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  // ── getBookmarks ────────────────────────────────────────────────────────────

  describe('getBookmarks', () => {
    it('should return paginated bookmarks for a user', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [mockBookmark] });

      const result = await getBookmarks(pool, userId, { page: 1, limit: 20 });

      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(mockBookmark);
    });

    it('should include search term in query parameters when provided', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockBookmark] });

      await getBookmarks(pool, userId, { search: 'example' });

      const countCallParams = (pool.query as jest.Mock).mock.calls[0][1];
      expect(countCallParams).toContain('example');
    });

    it('should include tag_id in query parameters when provided', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [mockBookmark] });

      await getBookmarks(pool, userId, { tag_id: 'tag-uuid-1' });

      const countCallParams = (pool.query as jest.Mock).mock.calls[0][1];
      expect(countCallParams).toContain('tag-uuid-1');
    });

    it('should return empty list when no bookmarks exist', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await getBookmarks(pool, userId, {});

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });

    it('should use default page=1 and limit=20 when not specified', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await getBookmarks(pool, userId, {});

      const dataCallParams = (pool.query as jest.Mock).mock.calls[1][1];
      expect(dataCallParams).toContain(20); // limit
      expect(dataCallParams).toContain(0);  // offset (page 1 => 0)
    });
  });

  // ── getBookmarkById ─────────────────────────────────────────────────────────

  describe('getBookmarkById', () => {
    it('should return a bookmark when found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockBookmark] });

      const result = await getBookmarkById(pool, userId, bookmarkId);

      expect(result).toEqual(mockBookmark);
    });

    it('should return null when bookmark does not exist', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await getBookmarkById(pool, userId, 'nonexistent-id');

      expect(result).toBeNull();
    });

    it('should query with both bookmarkId and userId for scoping', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockBookmark] });

      await getBookmarkById(pool, userId, bookmarkId);

      const params = (pool.query as jest.Mock).mock.calls[0][1];
      expect(params).toContain(bookmarkId);
      expect(params).toContain(userId);
    });
  });

  // ── updateBookmark ──────────────────────────────────────────────────────────

  describe('updateBookmark', () => {
    it('should update bookmark fields and return updated record', async () => {
      const updated = { ...mockBookmark, title: 'Updated Title' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: bookmarkId }] }) // existence check
        .mockResolvedValueOnce({ rows: [updated] }); // update

      const result = await updateBookmark(pool, userId, bookmarkId, { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
    });

    it('should throw if bookmark does not exist or belongs to another user', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(
        updateBookmark(pool, userId, 'wrong-id', { title: 'x' })
      ).rejects.toThrow('Bookmark not found');
    });

    it('should throw if new URL is invalid', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: bookmarkId }] });

      await expect(
        updateBookmark(pool, userId, bookmarkId, { url: 'bad-url' })
      ).rejects.toThrow('Invalid URL format');
    });

    it('should replace tag associations when tag_ids provided', async () => {
      const updated = { ...mockBookmark };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: bookmarkId }] })
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [] }) // DELETE bookmark_tags
        .mockResolvedValueOnce({ rows: [] }) // INSERT tag-A
        .mockResolvedValueOnce({ rows: [] }); // INSERT tag-B

      await updateBookmark(pool, userId, bookmarkId, {
        title: 'Updated',
        tag_ids: ['tag-A', 'tag-B'],
      });

      // DELETE call should be made
      const deleteCalls = (pool.query as jest.Mock).mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM bookmark_tags')
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it('should not touch tags when tag_ids is undefined', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: bookmarkId }] })
        .mockResolvedValueOnce({ rows: [mockBookmark] });

      await updateBookmark(pool, userId, bookmarkId, { title: 'New Title' });

      const deleteCalls = (pool.query as jest.Mock).mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM bookmark_tags')
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  // ── deleteBookmark ──────────────────────────────────────────────────────────

  describe('deleteBookmark', () => {
    it('should delete bookmark without error when found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: bookmarkId }] });

      await expect(deleteBookmark(pool, userId, bookmarkId)).resolves.toBeUndefined();
    });

    it('should throw if bookmark does not exist', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(deleteBookmark(pool, userId, 'nonexistent')).rejects.toThrow('Bookmark not found');
    });

    it('should delete only the user\'s bookmark (user-scoped)', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: bookmarkId }] });

      await deleteBookmark(pool, userId, bookmarkId);

      const params = (pool.query as jest.Mock).mock.calls[0][1];
      expect(params).toContain(bookmarkId);
      expect(params).toContain(userId);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Tag Service', () => {
  let pool: Pool;
  const userId = 'user-uuid-1';
  const tagId = 'tag-uuid-1';

  const mockTag: Tag = {
    id: tagId,
    user_id: userId,
    name: 'typescript',
  };

  beforeEach(() => {
    pool = new Pool();
    jest.clear