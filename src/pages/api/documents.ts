import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';

interface CloudflareEnv {
  DB: D1Database;
  DOCUMENTS_BUCKET: R2Bucket;
}

interface D1Database {
  prepare: (query: string) => D1PreparedStatement;
}

interface D1PreparedStatement {
  bind: (...values: unknown[]) => D1PreparedStatement;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: boolean; meta: Record<string, unknown> }>;
  first: <T = unknown>() => Promise<T | null>;
}

interface R2Bucket {
  delete: (key: string) => Promise<void>;
  createMultipartUpload?: (key: string) => Promise<unknown>;
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

interface DocumentMetadataBody {
  filename: string;
  storageKey: string;
  fileType: string;
  fileSize: number;
}

function getCloudflareEnv(): CloudflareEnv | null {
  if (
    process.env.NODE_ENV === 'production' &&
    typeof (globalThis as Record<string, unknown>).DB !== 'undefined'
  ) {
    return {
      DB: (globalThis as Record<string, unknown>).DB as D1Database,
      DOCUMENTS_BUCKET: (globalThis as Record<string, unknown>)
        .DOCUMENTS_BUCKET as R2Bucket,
    };
  }
  return null;
}

function camelCaseDocument(row: DocumentRow) {
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

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  db: D1Database
) {
  try {
    const { results } = await db
      .prepare(
        `SELECT id, user_id, filename, storage_key, file_type, file_size, uploaded_at
         FROM documents
         WHERE user_id = ?
         ORDER BY uploaded_at DESC`
      )
      .bind(userId)
      .all<DocumentRow>();

    const documents = (results || []).map(camelCaseDocument);

    return res.status(200).json({ documents });
  } catch (error) {
    console.error('[GET /api/documents] Error fetching documents:', error);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  db: D1Database
) {
  try {
    const body = req.body as DocumentMetadataBody;

    if (!body) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const { filename, storageKey, fileType, fileSize } = body;

    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      return res
        .status(400)
        .json({ error: 'filename is required and must be a non-empty string' });
    }

    if (
      !storageKey ||
      typeof storageKey !== 'string' ||
      storageKey.trim() === ''
    ) {
      return res
        .status(400)
        .json({
          error: 'storageKey is required and must be a non-empty string',
        });
    }

    if (!fileType || typeof fileType !== 'string' || fileType.trim() === '') {
      return res
        .status(400)
        .json({ error: 'fileType is required and must be a non-empty string' });
    }

    if (
      fileSize === undefined ||
      fileSize === null ||
      typeof fileSize !== 'number' ||
      fileSize <= 0
    ) {
      return res
        .status(400)
        .json({ error: 'fileSize is required and must be a positive number' });
    }

    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
    ];

    if (!ALLOWED_MIME_TYPES.includes(fileType)) {
      return res.status(400).json({
        error: `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (fileSize > MAX_FILE_SIZE) {
      return res
        .status(400)
        .json({ error: 'File size exceeds maximum allowed size of 50MB' });
    }

    const id = nanoid();
    const uploadedAt = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO documents (id, user_id, filename, storage_key, file_type, file_size, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, userId, filename.trim(), storageKey.trim(), fileType.trim(), fileSize, uploadedAt)
      .run();

    const document = {
      id,
      userId,
      filename: filename.trim(),
      storageKey: storageKey.trim(),
      fileType: fileType.trim(),
      fileSize,
      uploadedAt,
    };

    return res.status(201).json({ document });
  } catch (error) {
    console.error('[POST /api/documents] Error saving document metadata:', error);
    return res.status(500).json({ error: 'Failed to save document metadata' });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Authentication
  let userId: string | null = null;

  try {
    const auth = getAuth(req);
    userId = auth.userId;
  } catch (error) {
    console.error('[/api/documents] Auth error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No valid session' });
  }

  // Get D1 database binding
  const env = getCloudflareEnv();

  let db: D1Database;

  if (env?.DB) {
    db = env.DB;
  } else if (process.env.NODE_ENV !== 'production') {
    // Local development mock
    db = createMockDb();
  } else {
    console.error('[/api/documents] D1 database binding not available');
    return res.status(500).json({ error: 'Database connection unavailable' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, userId, db);

    case 'POST':
      return handlePost(req, res, userId, db);

    default:
      res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
      return res
        .status(405)
        .json({ error: `Method ${req.method} not allowed` });
  }
}

// ─── Local Development Mock DB ──────────────────────────────────────────────

const mockDocuments: DocumentRow[] = [];

function createMockDb(): D1Database {
  return {
    prepare: (query: string) => createMockStatement(query),
  };
}

function createMockStatement(query: string): D1PreparedStatement {
  const boundValues: unknown[] = [];

  const statement: D1PreparedStatement = {
    bind: (...values: unknown[]) => {
      boundValues.push(...values);
      return statement;
    },

    all: async <T = unknown>() => {
      const normalizedQuery = query.toLowerCase().trim();

      if (normalizedQuery.includes('select') && normalizedQuery.includes('from documents')) {
        const userId = boundValues[0] as string;
        const results = mockDocuments
          .filter((d) => d.user_id === userId)
          .sort(
            (a, b) =>
              new Date(b.uploaded_at).getTime() -
              new Date(a.uploaded_at).getTime()
          );
        return { results: results as unknown as T[] };
      }

      return { results: [] };
    },

    run: async () => {
      const normalizedQuery = query.toLowerCase().trim();

      if (normalizedQuery.includes('insert into documents')) {
        const [id, user_id, filename, storage_key, file_type, file_size, uploaded_at] =
          boundValues as [string, string, string, string, string, number, string];

        mockDocuments.push({
          id,
          user_id,
          filename,
          storage_key,
          file_type,
          file_size,
          uploaded_at,
        });

        return { success: true, meta: { changes: 1 } };
      }

      if (normalizedQuery.includes('delete from documents')) {
        const id = boundValues[0] as string;
        const userId = boundValues[1] as string;
        const index = mockDocuments.findIndex(
          (d) => d.id === id && d.user_id === userId
        );

        if (index !== -1) {
          mockDocuments.splice(index, 1);
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 0 } };
      }

      return { success: true, meta: {} };
    },

    first: async <T = unknown>() => {
      const normalizedQuery = query.toLowerCase().trim();

      if (
        normalizedQuery.includes('select') &&
        normalizedQuery.includes('from documents')
      ) {
        const id = boundValues[0] as string;
        const userId = boundValues[1] as string;
        const doc = mockDocuments.find(
          (d) => d.id === id && d.user_id === userId
        );
        return (doc as unknown as T) || null;
      }

      return null;
    },
  };

  return statement;
}