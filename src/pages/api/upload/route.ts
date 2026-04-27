import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

const ALLOWED_FILE_TYPES = [
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
    throw new Error('Missing required R2 environment variables');
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = getAuth(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to upload files.' },
        { status: 401 }
      );
    }

    let body: { filename?: unknown; fileType?: unknown; fileSize?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      );
    }

    const { filename, fileType, fileSize } = body;

    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      return NextResponse.json(
        { error: 'filename is required and must be a non-empty string.' },
        { status: 400 }
      );
    }

    if (!fileType || typeof fileType !== 'string') {
      return NextResponse.json(
        { error: 'fileType is required and must be a string.' },
        { status: 400 }
      );
    }

    if (typeof fileSize !== 'number' || fileSize <= 0) {
      return NextResponse.json(
        { error: 'fileSize is required and must be a positive number.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_FILE_TYPES.includes(fileType.toLowerCase())) {
      return NextResponse.json(
        {
          error: `File type "${fileType}" is not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size exceeds the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
        },
        { status: 400 }
      );
    }

    const sanitizedFilename = filename.trim().replace(/[^a-zA-Z0-9._\-\s]/g, '_');
    const docId = nanoid();
    const storageKey = `${userId}/${docId}/${sanitizedFilename}`;

    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      console.error('R2_BUCKET_NAME environment variable is not set');
      return NextResponse.json(
        { error: 'Storage configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    const r2Client = getR2Client();

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: {
        userId,
        docId,
        originalFilename: encodeURIComponent(sanitizedFilename),
      },
    });

    const expiresIn = 3600; // 1 hour in seconds
    const uploadUrl = await getSignedUrl(r2Client, putCommand, { expiresIn });

    return NextResponse.json(
      {
        uploadUrl,
        storageKey,
        docId,
        expiresIn,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error generating presigned upload URL:', error);

    if (error instanceof Error) {
      if (error.message.includes('Missing required R2 environment variables')) {
        return NextResponse.json(
          { error: 'Storage service is not properly configured.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while generating the upload URL.' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to generate an upload URL.' },
    { status: 405 }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to generate an upload URL.' },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to generate an upload URL.' },
    { status: 405 }
  );
}