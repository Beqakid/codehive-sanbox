import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

interface UploadUrlRequest {
  filename: string;
  fileType: string;
  fileSize: number;
}

interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
}

interface ErrorResponse {
  error: string;
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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function getR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing required R2 configuration environment variables');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

function validateRequest(body: unknown): { valid: boolean; error?: string; data?: UploadUrlRequest } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const { filename, fileType, fileSize } = body as Record<string, unknown>;

  if (!filename || typeof filename !== 'string' || filename.trim() === '') {
    return { valid: false, error: 'filename is required and must be a non-empty string' };
  }

  if (!fileType || typeof fileType !== 'string') {
    return { valid: false, error: 'fileType is required and must be a string' };
  }

  if (!ALLOWED_MIME_TYPES.includes(fileType)) {
    return {
      valid: false,
      error: `fileType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }

  if (fileSize === undefined || fileSize === null || typeof fileSize !== 'number') {
    return { valid: false, error: 'fileSize is required and must be a number' };
  }

  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    return { valid: false, error: 'fileSize must be a positive integer' };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `fileSize must not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  return {
    valid: true,
    data: {
      filename: filename.trim(),
      fileType,
      fileSize,
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadUrlResponse | ErrorResponse>
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const validation = validateRequest(req.body);

    if (!validation.valid || !validation.data) {
      return res.status(400).json({ error: validation.error ?? 'Invalid request' });
    }

    const { filename, fileType, fileSize } = validation.data;

    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      console.error('R2_BUCKET_NAME environment variable is not set');
      return res.status(500).json({ error: 'Storage configuration error' });
    }

    const docId = nanoid();
    const sanitizedFilename = sanitizeFilename(filename);
    const storageKey = `${userId}/${docId}/${sanitizedFilename}`;

    let r2Client: S3Client;
    try {
      r2Client = getR2Client();
    } catch (configError) {
      console.error('Failed to initialize R2 client:', configError);
      return res.status(500).json({ error: 'Storage configuration error' });
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: {
        'user-id': userId,
        'original-filename': encodeURIComponent(filename),
        'doc-id': docId,
      },
    });

    const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

    const uploadUrl = await getSignedUrl(r2Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    return res.status(200).json({
      uploadUrl,
      storageKey,
    });
  } catch (error) {
    console.error('Error generating presigned upload URL:', error);

    if (error instanceof Error) {
      if (error.message.includes('Missing required R2 configuration')) {
        return res.status(500).json({ error: 'Storage configuration error' });
      }
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}