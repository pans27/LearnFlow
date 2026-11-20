import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import type { PresignedUrlResponse } from '../types';
import { HttpError } from '../errors';

const URL_TTL_SECONDS = 300;
let client: S3Client | undefined;

// Require the bucket settings before any storage operation.
function settings() {
  const { region, bucket, accessKeyId, secretAccessKey } = config.s3;
  if (!region || !bucket || !accessKeyId || !secretAccessKey) throw new HttpError(500, 'S3 is not configured');
  return { region, bucket, accessKeyId, secretAccessKey };
}

// Reuse one client for the configured backend IAM user.
function s3(): S3Client {
  const { region, accessKeyId, secretAccessKey } = settings();
  client ??= new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

// Store a PDF and return its object key. The caller supplies the key.
export async function putPdf(key: string, body: Buffer): Promise<void> {
  const { bucket } = settings();
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/pdf' }));
}

// Remove an object. A missing object is already the desired end state.
export async function deleteObject(key: string): Promise<void> {
  const { bucket } = settings();
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Sign a short-lived GET URL for inline preview or a downloaded file.
export async function signedGetUrl(key: string, filename: string, download: boolean): Promise<PresignedUrlResponse> {
  const { bucket } = settings();
  const safeName = filename.replace(/["\r\n]/g, '');
  const disposition = `${download ? 'attachment' : 'inline'}; filename="${safeName}"`;
  const url = await getSignedUrl(s3(), new GetObjectCommand({
    Bucket: bucket, Key: key, ResponseContentType: 'application/pdf', ResponseContentDisposition: disposition,
  }), { expiresIn: URL_TTL_SECONDS });
  return { url, expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString() };
}
