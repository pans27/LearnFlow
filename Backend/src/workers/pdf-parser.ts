import type { ExtractedPage } from '../types/extraction.ts';

// TODO(file processing): set this to true only after implementing and testing parsePdf.
export const PDF_PARSER_READY = false;

// Extract ordered page text inside the worker thread using the team's chosen PDF library.
export async function parsePdf(_bytes: Uint8Array): Promise<ExtractedPage[]> {
  // TODO(file processing): implement PDF parsing and return consecutive pages starting at 1.
  throw new Error('PDF parser has not been implemented');
}
