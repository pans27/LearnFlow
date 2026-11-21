import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import type { PresignedUrlResponse, QuizAnswers } from '../types';
import type { Readable } from 'node:stream';
import { HttpError } from '../errors';

const URL_TTL_SECONDS = 300;
let client: S3Client | undefined;

// Archive finalized quiz answers as a private JSON object in the configured bucket.
export async function putQuizAnswers(key: string, answers: QuizAnswers): Promise<void> {
  const { bucket } = settings();
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(answers), ContentType: 'application/json' }),
    { abortSignal: AbortSignal.timeout(30000) });
}

// Read a finalized private quiz answer file with a bounded size and download deadline.
export async function getQuizAnswers(key: string): Promise<QuizAnswers> {
  const { bucket } = settings();
  const response = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30000) });
  if (!response.Body) throw new Error('Quiz answer file has no body');
  const body = response.Body as Readable;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > 3 * 1024 * 1024) { body.destroy(); throw new Error('Quiz answer file exceeds the size limit'); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as QuizAnswers;
}

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

// Read a stored PDF for extraction with a bounded download time and size.
export async function getPdf(key: string): Promise<Uint8Array> {
  const { bucket } = settings();
  const signal = AbortSignal.timeout(30000);
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
  if (!result.Body) throw new Error('Stored PDF has no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const body = result.Body as Readable;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > 10 * 1024 * 1024) {
      body.destroy();
      throw new Error('Stored PDF exceeds the 10 MB extraction limit');
    }
    chunks.push(chunk);
  }
  if (!size) throw new Error('Stored PDF is empty');
  return Buffer.concat(chunks);
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
