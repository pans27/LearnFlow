import { extractText, getDocumentProxy } from 'unpdf';
import type { ExtractedPage } from '../types/extraction.ts';

// Uploads and private S3 reads already reject anything larger than this.
const MAX_PDF_BYTES = 10 * 1024 * 1024;
// Bound a single job so one document cannot hold the parser thread indefinitely.
const MAX_PDF_PAGES = 500;

// The text-layer parser is implemented and covered by tests, so the API may consume queued jobs.
export const PDF_PARSER_READY = true;

// Keep stored page text searchable without turning blank or image-only pages into missing rows.
function pageText(value: string): string {
  return value.replaceAll('\u0000', '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

// Extract ordered page text inside the worker thread. Image-only pages stay empty; OCR is out of scope.
export async function parsePdf(bytes: Uint8Array): Promise<ExtractedPage[]> {
  if (bytes.byteLength === 0) throw new Error('PDF is empty');
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('PDF exceeds 10 MB');
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF exceeds ${MAX_PDF_PAGES} pages`);
    if (pdf.numPages === 0) return [];
    const { text } = await extractText(pdf, { mergePages: false });
    if (text.length !== pdf.numPages) throw new Error('PDF parser returned an unexpected page count');
    return text.map((value, index) => ({ pageNumber: index + 1, text: pageText(value) }));
  } finally {
    await pdf.cleanup();
  }
}
