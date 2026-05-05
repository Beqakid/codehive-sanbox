import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { authenticateJWT } from '../middleware/auth';
import { CreateBookmarkDto, UpdateBookmarkDto, Bookmark } from '../types';

const router = Router();

// All bookmark routes require authentication
router.use(authenticateJWT);

function getPool(req: Request): Pool {
  return (req as any).app.locals.pool as Pool;
}

/**
 * GET /api/bookmarks
 * List bookmarks with optional search, tag filtering, and pagination
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const pool = getPool(req);
  const userId = (req as any).user.id;

  const search = (req.query.search as string) || '';
  const tagId = (req.query.tag_id as string) || '';
  const tagName = (req.query.tag_name as string) || '';
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ['b.user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (search) {
      conditions.push(
        `to_tsvector('english', b.title || ' ' || COALESCE(b.description, '')) @@ plainto_tsquery('english', $${paramIndex})`
      );
      params.push(search);
      paramIndex++;
    }

    if (tagId) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM bookmark_tags bt
          WHERE bt.bookmark_id = b.id
            AND bt.tag_id = $${paramIndex}
        )`
      );
      params.push(tagId);
      paramIndex++;
    } else if (tagName) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM bookmark_tags bt
          JOIN tags t ON t.id = bt.tag_id
          WHERE bt.bookmark_id = b.id
            AND t.user_id = $1
            AND LOWER(t.name) = LOWER($${paramIndex})
        )`
      );
      params.push(tagName);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM bookmarks b
      ${whereClause}
    `;

    const dataQuery = `
      SELECT
        b.id,
        b.user_id,
        b.url,
        b.title,
        b.description,
        b.created_at,
        b.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', t.id, 'user_id', t.user_id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) AS tags
      FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
      LEFT JOIN tags t ON t.id = bt.tag_id
      ${whereClause}
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countParams = [...params];
    const dataParams = [...params, limit, offset];

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, countParams),
      pool.query(dataQuery, dataParams),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    res.status(200).json({
      data: dataResult.rows as Bookmark[],
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bookmarks
 * Create a new bookmark
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const pool = getPool(req);
  const userId = (req as any).user.id;
  const { url, title, description, tag_ids }: CreateBookmarkDto = req.body;

  if (!url || !title) {
    res.status(400).json({ error: 'url and title are required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertBookmark = await client.query(
      `INSERT INTO bookmarks (user_id, url, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, url, title, description, created_at, updated_at`,
      [userId, url, title, description || null]
    );

    const bookmark = insertBookmark.rows[0];

    if (tag_ids && tag_ids.length > 0) {
      // Verify all tags belong to the user before associating
      const tagCheck = await client.query(
        `SELECT id FROM tags WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [tag_ids, userId]
      );

      if (tagCheck.rows.length !== tag_ids.length) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'One or more tag_ids are invalid or do not belong to the user' });
        return;
      }

      const tagValues = tag_ids.map((tagId, idx) => `($1, $${idx + 2})`).join(', ');
      await client.query(
        `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ${tagValues}`,
        [bookmark.id, ...tag_ids]
      );
    }

    await client.query('COMMIT');

    // Fetch the full bookmark with tags
    const fullBookmark = await pool.query(
      `SELECT
        b.id, b.user_id, b.url, b.title, b.description, b.created_at, b.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', t.id, 'user_id', t.user_id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) AS tags
       FROM bookmarks b
       LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
       LEFT JOIN tags t ON t.id = bt.tag_id
       WHERE b.id = $1
       GROUP BY b.id`,
      [bookmark.id]
    );

    res.status(201).json(fullBookmark.rows[0] as Bookmark);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * GET /api/bookmarks/:id
 * Get a single bookmark by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const pool = getPool(req);
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT
        b.id, b.user_id, b.url, b.title, b.description, b.created_at, b.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', t.id, 'user_id', t.user_id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) AS tags
       FROM bookmarks b
       LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
       LEFT JOIN tags t ON t.id = bt.tag_id
       WHERE b.id = $1 AND b.user_id = $2
       GROUP BY b.id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bookmark not found' });
      return;
    }

    res.status(200).json(result.rows[0] as Bookmark);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/bookmarks/:id
 * Update a bookmark
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const pool = getPool(req);
  const userId = (req as any).user.id;
  const { id } = req.params;
  const { url, title, description, tag_ids }: UpdateBookmarkDto = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ownership
    const existing = await client.query(
      `SELECT id FROM bookmarks WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Bookmark not found' });
      return;
    }

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (url !== undefined) {
      setClauses.push(`url = $${paramIndex++}`);
      params.push(url);
    }
    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(description);
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_at = NOW()`);
      params.push(id);
      params.push(userId);

      await client.query(
        `UPDATE bookmarks SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}`,
        params
      );
    }

    // Update tags if provided
    if (tag_ids !== undefined) {
      if (tag_ids.length > 0) {
        // Verify all tags belong to the user
        const tagCheck = await client.query(
          `SELECT id FROM tags WHERE id = ANY($1::uuid[]) AND user_id = $2`,
          [tag_ids, userId]
        );

        if (tagCheck.rows.length !== tag_ids.length) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: 'One or more tag_ids are invalid or do not belong to the user' });
          return;
        }
      }

      // Remove existing associations
      await client.query(`DELETE FROM bookmark_tags WHERE bookmark_id = $1`, [id]);

      // Insert new associations
      if (tag_ids.length > 0) {
        const tagValues = tag_ids.map((tagId, idx) => `($1, $${idx + 2})`).join(', ');
        await client.query(
          `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ${tagValues}`,
          [id, ...tag_ids]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch the updated bookmark with tags
    const fullBookmark = await pool.query(
      `SELECT
        b.id, b.user_id, b.url, b.title, b.description, b.created_at, b.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', t.id, 'user_id', t.user_id, 'name', t.name)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) AS tags
       FROM bookmarks b
       LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
       LEFT JOIN tags t ON t.id = bt.tag_id
       WHERE b.id = $1
       GROUP BY b.id`,
      [id]
    );

    res.status(200).json(fullBookmark.rows[0] as Bookmark);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/bookmarks/:id
 * Delete a bookmark
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const pool = getPool(req);
  const userId = (req as any).user.id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bookmark not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;