import { Pool, QueryResult } from 'pg';
import { Tag, BookmarkTag } from '../../types';

export class TagModel {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async findAllByUser(userId: string): Promise<Tag[]> {
    const query = `
      SELECT id, user_id, name
      FROM tags
      WHERE user_id = $1
      ORDER BY name ASC
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async findById(id: string, userId: string): Promise<Tag | null> {
    const query = `
      SELECT id, user_id, name
      FROM tags
      WHERE id = $1 AND user_id = $2
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  async findByName(name: string, userId: string): Promise<Tag | null> {
    const query = `
      SELECT id, user_id, name
      FROM tags
      WHERE name = $1 AND user_id = $2
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [name, userId]);
    return result.rows[0] || null;
  }

  async findByIds(ids: string[], userId: string): Promise<Tag[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const query = `
      SELECT id, user_id, name
      FROM tags
      WHERE id IN (${placeholders}) AND user_id = $1
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [userId, ...ids]);
    return result.rows;
  }

  async create(userId: string, name: string): Promise<Tag> {
    const query = `
      INSERT INTO tags (user_id, name)
      VALUES ($1, $2)
      RETURNING id, user_id, name
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [userId, name.trim()]);
    return result.rows[0];
  }

  async upsert(userId: string, name: string): Promise<Tag> {
    const query = `
      INSERT INTO tags (user_id, name)
      VALUES ($1, $2)
      ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, user_id, name
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [userId, name.trim()]);
    return result.rows[0];
  }

  async update(id: string, userId: string, name: string): Promise<Tag | null> {
    const query = `
      UPDATE tags
      SET name = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, user_id, name
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [name.trim(), id, userId]);
    return result.rows[0] || null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM tags
      WHERE id = $1 AND user_id = $2
    `;
    const result = await this.pool.query(query, [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async findByBookmarkId(bookmarkId: string, userId: string): Promise<Tag[]> {
    const query = `
      SELECT t.id, t.user_id, t.name
      FROM tags t
      INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
      WHERE bt.bookmark_id = $1 AND t.user_id = $2
      ORDER BY t.name ASC
    `;
    const result: QueryResult<Tag> = await this.pool.query(query, [bookmarkId, userId]);
    return result.rows;
  }

  async addTagToBookmark(bookmarkId: string, tagId: string): Promise<BookmarkTag> {
    const query = `
      INSERT INTO bookmark_tags (bookmark_id, tag_id)
      VALUES ($1, $2)
      ON CONFLICT (bookmark_id, tag_id) DO NOTHING
      RETURNING bookmark_id, tag_id
    `;
    const result: QueryResult<BookmarkTag> = await this.pool.query(query, [bookmarkId, tagId]);
    return result.rows[0] || { bookmark_id: bookmarkId, tag_id: tagId };
  }

  async removeTagFromBookmark(bookmarkId: string, tagId: string): Promise<boolean> {
    const query = `
      DELETE FROM bookmark_tags
      WHERE bookmark_id = $1 AND tag_id = $2
    `;
    const result = await this.pool.query(query, [bookmarkId, tagId]);
    return (result.rowCount ?? 0) > 0;
  }

  async removeAllTagsFromBookmark(bookmarkId: string): Promise<void> {
    const query = `
      DELETE FROM bookmark_tags
      WHERE bookmark_id = $1
    `;
    await this.pool.query(query, [bookmarkId]);
  }

  async setBookmarkTags(bookmarkId: string, tagIds: string[], userId: string): Promise<Tag[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'DELETE FROM bookmark_tags WHERE bookmark_id = $1',
        [bookmarkId]
      );

      if (tagIds.length > 0) {
        const placeholders = tagIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(', ');
        const insertQuery = `
          INSERT INTO bookmark_tags (bookmark_id, tag_id)
          VALUES ${placeholders}
          ON CONFLICT (bookmark_id, tag_id) DO NOTHING
        `;
        await client.query(insertQuery, [bookmarkId, ...tagIds]);
      }

      await client.query('COMMIT');

      if (tagIds.length === 0) return [];

      const tagsResult = await this.pool.query<Tag>(
        `SELECT t.id, t.user_id, t.name
         FROM tags t
         INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
         WHERE bt.bookmark_id = $1 AND t.user_id = $2
         ORDER BY t.name ASC`,
        [bookmarkId, userId]
      );
      return tagsResult.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBookmarkTagsMap(bookmarkIds: string[], userId: string): Promise<Map<string, Tag[]>> {
    const tagMap = new Map<string, Tag[]>();

    if (bookmarkIds.length === 0) return tagMap;

    bookmarkIds.forEach(id => tagMap.set(id, []));

    const placeholders = bookmarkIds.map((_, i) => `$${i + 2}`).join(', ');
    const query = `
      SELECT t.id, t.user_id, t.name, bt.bookmark_id
      FROM tags t
      INNER JOIN bookmark_tags bt ON bt.tag_id = t.id
      WHERE bt.bookmark_id IN (${placeholders}) AND t.user_id = $1
      ORDER BY t.name ASC
    `;

    const result = await this.pool.query<Tag & { bookmark_id: string }>(
      query,
      [userId, ...bookmarkIds]
    );

    result.rows.forEach(row => {
      const { bookmark_id, ...tag } = row;
      const existing = tagMap.get(bookmark_id) || [];
      existing.push(tag);
      tagMap.set(bookmark_id, existing);
    });

    return tagMap;
  }

  async findByTagName(tagName: string, userId: string): Promise<Tag | null> {
    return this.findByName(tagName, userId);
  }

  async countByUser(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM tags
      WHERE user_id = $1
    `;
    const result = await this.pool.query(query, [userId]);
    return parseInt(result.rows[0].count, 10);
  }
}