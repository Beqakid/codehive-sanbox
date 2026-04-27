import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
} = process.env;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET) {
  throw new Error("Cloudflare R2 configuration missing.");
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generates R2 object key for a user's avatar/photo.
 * @param userId - The user's UUID
 * @param extension - File extension (e.g. "jpg", "png")
 */
export function getProfilePhotoKey(userId: string, extension: string) {
  return `avatars/${userId}.${extension.replace(/^\./, '')}`;
}

/**
 * Uploads a profile photo buffer to R2 for a user.
 * @param opts
 *   - userId: string
 *   - buffer: Uint8Array | Buffer | ReadableStream
 *   - mimeType: string
 *   - extension: string (without dot)
 * @returns R2 object key
 */
export async function uploadProfilePhoto({
  userId,
  buffer,
  mimeType,
  extension,
}: {
  userId: string;
  buffer: Uint8Array | Buffer | ReadableStream | Blob;
  mimeType: string;
  extension: string;
}): Promise<string> {
  const key = getProfilePhotoKey(userId, extension);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'public-read', // optional, R2 doesn't support ACL, but AWS SDK expects it
    }),
  );

  return key;
}

/**
 * Gets a profile photo as a signed/public URL.
 * NOTE: This is a public URL pattern for R2; public read should be configured for the bucket.
 * @param key - The R2 object key
 */
export function getProfilePhotoURL(key: string): string {
  // Example: https://<accountid>.r2.cloudflarestorage.com/<bucket>/<key>
  // R2_ENDPOINT: "https://xxxx.r2.cloudflarestorage.com"
  return `${R2_ENDPOINT!.replace(/\/$/, '')}/${R2_BUCKET}/${key}`;
}

/**
 * Deletes a profile photo from R2 for a user.
 * @param userId
 * @param extension
 */
export async function deleteProfilePhoto(userId: string, extension: string): Promise<void> {
  const key = getProfilePhotoKey(userId, extension);

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET!,
        Key: key,
      }),
    );
  } catch (e: any) {
    if (
      e &&
      typeof e === 'object' &&
      (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404)
    ) {
      // No-op if object already deleted
      return;
    }
    throw e;
  }
}

/**
 * Fetch and stream a profile photo from R2 (for image proxy endpoints).
 * @param key - R2 object key
 * @returns {Promise<{stream: ReadableStream, contentType: string, contentLength?: number}>}
 */
export async function getProfilePhotoStream(
  key: string,
): Promise<{ stream: ReadableStream<any>; contentType: string; contentLength?: number }> {
  const res = await r2.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET!,
      Key: key,
    }),
  );
  if (!res.Body) throw new Error('Profile photo missing');
  // Convert Node.js or web stream to web ReadableStream
  let stream: any = res.Body;
  if (typeof stream.getReader !== 'function' && typeof stream.pipeTo === 'undefined') {
    // Node.js stream, convert to web ReadableStream if needed
    const { Readable } = require('stream');
    stream = Readable.toWeb(stream);
  }
  return {
    stream,
    contentType: res.ContentType ?? 'image/jpeg',
    contentLength: res.ContentLength,
  };
}

/**
 * Checks if a profile photo exists for a user (head request)
 * @param userId
 * @param extension
 * @returns boolean
 */
export async function profilePhotoExists(userId: string, extension: string): Promise<boolean> {
  const key = getProfilePhotoKey(userId, extension);
  try {
    await r2.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET!,
        Key: key,
        Range: 'bytes=0-0',
      }),
    );
    return true;
  } catch (e: any) {
    if (
      e &&
      typeof e === 'object' &&
      (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404)
    ) {
      return false;
    }
    throw e;
  }
}