import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { authenticateJwt } from '../middleware/auth';
import { Tag } from '../types';

export function createTagsRouter(pool: Pool): Router {
  const router = Router();

  router.use(authenticateJwt);

  // GET /api/tags - List all tags for the authenticated user
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const result = await pool.query<Tag>(
        `SELECT id, user_id, name
         FROM tags
         WHERE user_id = $1
         ORDER BY name ASC`,
        [userId]
      );

      res.json({ data: result.rows, total: result.rowCount });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/tags - Create a new tag
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Tag name is required and must be a non-empty string.' });
        return;
      }

      const trimmedName = name.trim();

      if (trimmedName.length > 100) {
        res.status(400).json({ error: 'Tag name must not exceed 100 characters.' });
        return;
      }

      const result = await pool.query<Tag>(
        `INSERT INTO tags (user_id, name)
         VALUES ($1, $2)
         RETURNING id, user_id, name`,
        [userId, trimmedName]
      );

      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: 'A tag with this name already exists.' });
        return;
      }
      next(err);
    }
  });

  // GET /api/tags/:id - Get a single tag
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const result = await pool.query<Tag>(
        `SELECT id, user_id, name
         FROM tags
         WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Tag not found.' });
        return;
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/tags/:id - Update a tag
  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Tag name is required and must be a non-empty string.' });
        return;
      }

      const trimmedName = name.trim();

      if (trimmedName.length > 100) {
        res.status(400).json({ error: 'Tag name must not exceed 100 characters.' });
        return;
      }

      const existing = await pool.query(
        `SELECT id FROM tags WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );

      if (existing.rowCount === 0) {
        res.status(404).json({ error: 'Tag not found.' });
        return;
      }

      const result = await pool.query<Tag>(
        `UPDATE tags
         SET name = $1
         WHERE id = $2 AND user_id = $3
         RETURNING id, user_id, name`,
        [trimmedName, id, userId]
      );

      res.json(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: 'A tag with this name already exists.' });
        return;
      }
      next(err);
    }
  });

  // DELETE /api/tags/:id - Delete a tag
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const result = await pool.query(
        `DELETE FROM tags
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, userId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Tag not found.' });
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // POST /api/tags/:id/bookmarks/:bookmarkId - Associate a tag with a bookmark
  router.post(
    '/:id/bookmarks/:bookmarkId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        const { id: tagId, bookmarkId } = req.params;

        // Verify tag belongs to user
        const tagResult = await pool.query(
          `SELECT id FROM tags WHERE id = $1 AND user_id = $2`,
          [tagId, userId]
        );

        if (tagResult.rowCount === 0) {
          res.status(404).json({ error: 'Tag not found.' });
          return;
        }

        // Verify bookmark belongs to user
        const bookmarkResult = await pool.query(
          `SELECT id FROM bookmarks WHERE id = $1 AND user_id = $2`,
          [bookmarkId, userId]
        );

        if (bookmarkResult.rowCount === 0) {
          res.status(404).json({ error: 'Bookmark not found.' });
          return;
        }

        // Insert association, ignore if already exists
        await pool.query(
          `INSERT INTO bookmark_tags (bookmark_id, tag_id)
           VALUES ($1, $2)
           ON CONFLICT (bookmark_id, tag_id) DO NOTHING`,
          [bookmarkId, tagId]
        );

        res.status(201).json({ bookmark_id: bookmarkId, tag_id: tagId });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /api/tags/:id/bookmarks/:bookmarkId - Disassociate a tag from a bookmark
  router.delete(
    '/:id/bookmarks/:bookmarkId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        const { id: tagId, bookmarkId } = req.params;

        // Verify tag belongs to user
        const tagResult = await pool.query(
          `SELECT id FROM tags WHERE id = $1 AND user_id = $2`,
          [tagId, userId]
        );

        if (tagResult.rowCount === 0) {
          res.status(404).json({ error: 'Tag not found.' });
          return;
        }

        // Verify bookmark belongs to user
        const bookmarkResult = await pool.query(
          `SELECT id FROM bookmarks WHERE id = $1 AND user_id = $2`,
          [bookmarkId, userId]
        );

        if (bookmarkResult.rowCount === 0) {
          res.status(404).json({ error: 'Bookmark not found.' });
          return;
        }

        const result = await pool.query(
          `DELETE FROM bookmark_tags
           WHERE bookmark_id = $1 AND tag_id = $2
           RETURNING bookmark_id`,
          [bookmarkId, tagId]
        );

        if (result.rowCount === 0) {
          res.status(404).json({ error: 'Association between tag and bookmark not found.' });
          return;
        }

        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/tags/:id/bookmarks - List all bookmarks associated with a tag
  router.get(
    '/:id/bookmarks',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        const { id: tagId } = req.params;

        // Verify tag belongs to user
        const tagResult = await pool.query(
          `SELECT id FROM tags WHERE id = $1 AND user_id = $2`,
          [tagId, userId]
        );

        if (tagResult.rowCount === 0) {
          res.status(404).json({ error: 'Tag not found.' });
          return;
        }

        const result = await pool.query(
          `SELECT b.id, b.user_id, b.url, b.title, b.description, b.created_at, b.updated_at,
                  COALESCE(
                    json_agg(
                      json_build_object('id', t.id, 'user_id', t.user_id, 'name', t.name)
                    ) FILTER (WHERE t.id IS NOT NULL),
                    '[]'
                  ) AS tags
           FROM bookmarks b
           INNER JOIN bookmark_tags bt_filter ON bt_filter.bookmark_id = b.id AND bt_filter.tag_id = $1
           LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
           LEFT JOIN tags t ON t.id = bt.tag_id
           WHERE b.user_id = $2
           GROUP BY b.id
           ORDER BY b.created_at DESC`,
          [tagId, userId]
        );

        res.json({ data: result.rows, total: result.rowCount });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}