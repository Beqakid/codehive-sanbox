import { pool } from '../pool';
import {
  Bookmark,
  CreateBookmarkDto,
  UpdateBookmarkDto,
  Tag,
} from '../../types';

interface ListBookmarksOptions {
  userId: string;
  search?: string;
  tagId?: string;
  tagName?: string;
  page?: number;
  limit?: number;
}

interface ListBookmarksResult {
  data: Bookmark[];
  total: number;
}

export async function createBookmark(
  userId: string,
  dto: CreateBookmarkDto
): Promise<Bookmark> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookmarkResult = await client.query<Bookmark>(
      `INSERT INTO bookmarks (user_id, url, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, url, title, description, created_at, updated_at`,
      [userId, dto.url, dto.title, dto.description ?? null]
    );

    const bookmark = bookmarkResult.rows[0];

    if (dto.tag_ids && dto.tag_ids.length > 0) {
      const validTagsResult = await client.query<Tag>(
        `SELECT id FROM tags WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [dto.tag_ids, userId]
      );

      const validTagIds = validTagsResult.rows.map((row) => row.id);

      if (validTagIds.length > 0) {
        const values = validTagIds
          .map((_, idx) => `($1, $${idx + 2})`)
          .join(', ');
        await client.query(
          `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ${values}
           ON CONFLICT DO NOTHING`,
          [bookmark.id, ...validTagIds]
        );
      }
    }

    await client.query('COMMIT');

    const fullBookmark = await getBookmarkById(bookmark.id, userId);
    return fullBookmark!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getBookmarkById(
  bookmarkId: string,
  userId: string
): Promise<Bookmark | null> {
  const result = await pool.query<
    Bookmark & { tag_ids: string[] | null; tag_names: string[] | null }
  >(
    `SELECT
       b.id,
       b.user_id,
       b.url,
       b.title,
       b.description,
       b.created_at,
       b.updated_at,
       ARRAY_AGG(t.id) FILTER (WHERE t.id IS NOT NULL)   AS tag_ids,
       ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL) AS tag_names
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE b.id = $1 AND b.user_id = $2
     GROUP BY b.id`,
    [bookmarkId, userId]
  );

  if (result.rows.length === 0) return null;

  return normalizeBookmark(result.rows[0]);
}

export async function listBookmarks(
  options: ListBookmarksOptions
): Promise<ListBookmarksResult> {
  const { userId, search, tagId, tagName, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['b.user_id = $1'];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (search) {
    conditions.push(
      `to_tsvector('english', b.title || ' ' || COALESCE(b.description, '')) @@ plainto_tsquery('english', $${paramIdx})`
    );
    params.push(search);
    paramIdx++;
  }

  if (tagId) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM bookmark_tags bt2
         WHERE bt2.bookmark_id = b.id AND bt2.tag_id = $${paramIdx}::uuid
       )`
    );
    params.push(tagId);
    paramIdx++;
  } else if (tagName) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM bookmark_tags bt2
         JOIN tags t2 ON t2.id = bt2.tag_id
         WHERE bt2.bookmark_id = b.id
           AND t2.user_id = $1
           AND LOWER(t2.name) = LOWER($${paramIdx})
       )`
    );
    params.push(tagName);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT b.id) AS count
     FROM bookmarks b
     WHERE ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await pool.query<
    Bookmark & { tag_ids: string[] | null; tag_names: string[] | null }
  >(
    `SELECT
       b.id,
       b.user_id,
       b.url,
       b.title,
       b.description,
       b.created_at,
       b.updated_at,
       ARRAY_AGG(t.id ORDER BY t.name)   FILTER (WHERE t.id IS NOT NULL)   AS tag_ids,
       ARRAY_AGG(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL) AS tag_names
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE ${whereClause}
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return {
    data: dataResult.rows.map(normalizeBookmark),
    total,
  };
}

export async function updateBookmark(
  bookmarkId: string,
  userId: string,
  dto: UpdateBookmarkDto
): Promise<Bookmark | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (dto.url !== undefined) {
      setClauses.push(`url = $${paramIdx}`);
      params.push(dto.url);
      paramIdx++;
    }

    if (dto.title !== undefined) {
      setClauses.push(`title = $${paramIdx}`);
      params.push(dto.title);
      paramIdx++;
    }

    if (dto.description !== undefined) {
      setClauses.push(`description = $${paramIdx}`);
      params.push(dto.description);
      paramIdx++;
    }

    params.push(bookmarkId);
    const bookmarkIdParam = paramIdx;
    paramIdx++;

    params.push(userId);
    const userIdParam = paramIdx;

    const updateResult = await client.query<Bookmark>(
      `UPDATE bookmarks
       SET ${setClauses.join(', ')}
       WHERE id = $${bookmarkIdParam} AND user_id = $${userIdParam}
       RETURNING id`,
      params
    );

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    if (dto.tag_ids !== undefined) {
      await client.query(
        `DELETE FROM bookmark_tags WHERE bookmark_id = $1`,
        [bookmarkId]
      );

      if (dto.tag_ids.length > 0) {
        const validTagsResult = await client.query<Tag>(
          `SELECT id FROM tags WHERE id = ANY($1::uuid[]) AND user_id = $2`,
          [dto.tag_ids, userId]
        );

        const validTagIds = validTagsResult.rows.map((row) => row.id);

        if (validTagIds.length > 0) {
          const values = validTagIds
            .map((_, idx) => `($1, $${idx + 2})`)
            .join(', ');
          await client.query(
            `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ${values}
             ON CONFLICT DO NOTHING`,
            [bookmarkId, ...validTagIds]
          );
        }
      }
    }

    await client.query('COMMIT');

    const updated = await getBookmarkById(bookmarkId, userId);
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteBookmark(
  bookmarkId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM bookmarks WHERE id = $1 AND user_id = $2`,
    [bookmarkId, userId]
  );

  return (result.rowCount ?? 0) > 0;
}

function normalizeBookmark(
  row: Bookmark & { tag_ids: string[] | null; tag_names: string[] | null }
): Bookmark {
  const tags: Tag[] = [];

  if (row.tag_ids && row.tag_names) {
    for (let i = 0; i < row.tag_ids.length; i++) {
      tags.push({
        id: row.tag_ids[i],
        user_id: row.user_id,
        name: row.tag_names[i],
      });
    }
  }

  const { tag_ids, tag_names, ...bookmark } = row as typeof row;

  return {
    ...bookmark,
    tags,
  };
}