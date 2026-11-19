import Busboy from 'busboy';
import type { Request } from 'express';
import { HttpError } from '../errors';

export type UploadedPdf = {
  filename: string;
  mimeType: string;
  body: Buffer;
  fields: Record<string, string>;
};

// Read one multipart PDF and its text fields from the request.
export function readPdfUpload(req: Request): Promise<UploadedPdf> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) throw new HttpError(400, 'Body must be multipart form data');
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 10, fieldSize: 10000 } });
    const fields: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let filename = '';
    let mimeType = 'application/octet-stream';
    let fileCount = 0;
    let tooLarge = false;
    busboy.on('field', (name, value) => { fields[name] = value; });
    busboy.on('file', (name, stream, info) => {
      if (name !== 'file') { stream.resume(); return; }
      fileCount += 1;
      filename = info.filename || 'document.pdf';
      mimeType = info.mimeType;
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => { tooLarge = true; });
    });
    busboy.on('error', reject);
    busboy.on('finish', () => {
      if (tooLarge) reject(new HttpError(400, 'Choose a nonempty PDF up to 10 MB'));
      else if (fileCount !== 1) reject(new HttpError(400, 'file is required'));
      else resolve({ filename, mimeType, body: Buffer.concat(chunks), fields });
    });
    req.pipe(busboy);
  });
}
