import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';

interface CloudflareEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
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

function getCloudflareEnv(): CloudflareEnv {
  const env = process.env as unknown as CloudflareEnv;
  return env;
}

async function generateSignedGetUrl(
  bucket: R2Bucket,
  storageKey: string,
  expiresInSeconds = 3600
): Promise<string> {
  // Cloudflare R2 presigned URL generation
  // In Workers/Pages Functions context, use the R2 binding's createPresignedUrl if available,
  // otherwise fall back to constructing via the public URL pattern.
  // Since Next.js on Cloudflare Pages uses the R2 binding, we attempt presigned URL generation.
  const object = bucket as unknown as {
    createPresignedUrl?: (
      method: string,
      key: string,
      options: { expiresIn: number }
    ) => Promise<string>;
  };

  if (typeof object.createPresignedUrl === 'function') {
    return object.createPresignedUrl('GET', storageKey, {
      expiresIn: expiresInSeconds,
    });
  }

  // Fallback: return a URL using the R2 public bucket base URL env var
  const baseUrl = process.env.R2_PUBLIC_URL ?? '';
  return `${baseUrl}/${encodeURIComponent(storageKey)}`;
}

// GET /api/documents — list all documents for the current user
// GET /api/documents/[id]/url — get signed URL (handled by query param ?id=&action=url)
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');
    const action = searchParams.get('action');

    const env = getCloudflareEnv();

    if (!env.DB) {
      return NextResponse.json(
        { error: 'Database binding not available' },
        { status: 500 }
      );
    }

    // GET /api/documents?id=[id]&action=url — return signed GET URL for a specific document
    if (docId && action === 'url') {
      const row = await env.DB.prepare(
        'SELECT * FROM documents WHERE id = ? AND user_id = ?'
      )
        .bind(docId, userId)
        .first<DocumentRow>();

      if (!row) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 }
        );
      }

      if (!env.STORAGE) {
        return NextResponse.json(
          { error: 'Storage binding not available' },
          { status: 500 }
        );
      }

      const signedUrl = await generateSignedGetUrl(
        env.STORAGE,
        row.storage_key
      );

      return NextResponse.json({
        id: row.id,
        filename: row.filename,
        signedUrl,
        expiresIn: 3600,
      });
    }

    // GET /api/documents — list all documents
    const result = await env.DB.prepare(
      'SELECT * FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC'
    )
      .bind(userId)
      .all<DocumentRow>();

    const documents = (result.results ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      storageKey: row.storage_key,
      fileType: row.file_type,
      fileSize: row.file_size,
      uploadedAt: row.uploaded_at,
    }));

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('[GET /api/documents] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/documents — save document metadata after successful upload
// POST /api/documents?action=upload-url — generate presigned R2 PUT URL
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const env = getCloudflareEnv();

    // POST /api/documents?action=upload-url — generate presigned PUT URL
    if (action === 'upload-url') {
      const body = await request.json();
      const { filename, fileType, fileSize } = body as {
        filename?: string;
        fileType?: string;
        fileSize?: number;
      };

      if (!filename || !fileType || fileSize == null) {
        return NextResponse.json(
          { error: 'filename, fileType, and fileSize are required' },
          { status: 400 }
        );
      }

      if (fileSize > 50 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File size exceeds 50MB limit' },
          { status: 400 }
        );
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/tiff',
      ];

      if (!allowedTypes.includes(fileType)) {
        return NextResponse.json(
          {
            error:
              'Invalid file type. Only PDF and image files are allowed.',
          },
          { status: 400 }
        );
      }

      const docId = nanoid();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageKey = `${userId}/${docId}/${sanitizedFilename}`;

      if (!env.STORAGE) {
        return NextResponse.json(
          { error: 'Storage binding not available' },
          { status: 500 }
        );
      }

      const bucket = env.STORAGE as unknown as {
        createPresignedUrl?: (
          method: string,
          key: string,
          options: { expiresIn: number }
        ) => Promise<string>;
      };

      let uploadUrl: string;

      if (typeof bucket.createPresignedUrl === 'function') {
        uploadUrl = await bucket.createPresignedUrl('PUT', storageKey, {
          expiresIn: 900, // 15 minutes
        });
      } else {
        // Fallback for local dev — return a placeholder
        const baseUrl = process.env.R2_PUBLIC_URL ?? 'http://localhost:8787';
        uploadUrl = `${baseUrl}/upload/${encodeURIComponent(storageKey)}`;
      }

      return NextResponse.json({ uploadUrl, storageKey, docId });
    }

    // POST /api/documents — save document metadata
    if (!env.DB) {
      return NextResponse.json(
        { error: 'Database binding not available' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { filename, storageKey, fileType, fileSize } = body as {
      filename?: string;
      storageKey?: string;
      fileType?: string;
      fileSize?: number;
    };

    if (!filename || !storageKey || !fileType || fileSize == null) {
      return NextResponse.json(
        {
          error:
            'filename, storageKey, fileType, and fileSize are required',
        },
        { status: 400 }
      );
    }

    const docId = nanoid();
    const uploadedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO documents (id, user_id, filename, storage_key, file_type, file_size, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(docId, userId, filename, storageKey, fileType, fileSize, uploadedAt)
      .run();

    const document = {
      id: docId,
      userId,
      filename,
      storageKey,
      fileType,
      fileSize,
      uploadedAt,
    };

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/documents] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/documents?id=[id] — delete document metadata and R2 object
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');

    if (!docId) {
      return NextResponse.json(
        { error: 'Document id is required' },
        { status: 400 }
      );
    }

    const env = getCloudflareEnv();

    if (!env.DB) {
      return NextResponse.json(
        { error: 'Database binding not available' },
        { status: 500 }
      );
    }

    // Fetch the document to verify ownership and get the storage key
    const row = await env.DB.prepare(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?'
    )
      .bind(docId, userId)
      .first<DocumentRow>();

    if (!row) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Delete from R2
    if (env.STORAGE) {
      try {
        await env.STORAGE.delete(row.storage_key);
      } catch (storageError) {
        console.error(
          '[DELETE /api/documents] R2 delete error:',
          storageError
        );
        // Continue to delete metadata even if R2 delete fails
      }
    }

    // Delete metadata from D1
    await env.DB.prepare(
      'DELETE FROM documents WHERE id = ? AND user_id = ?'
    )
      .bind(docId, userId)
      .run();

    return NextResponse.json(
      { message: 'Document deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('[DELETE /api/documents] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}