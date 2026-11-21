import { Worker } from 'node:worker_threads';
import { getPdf } from '../storage/s3';
import type { ExtractedPage, PdfProcessor, PdfThreadOptions } from '../types';

// Transfer owned document bytes to an isolated parser thread and enforce a processing deadline.
export function parsePdfInThread(bytes: Uint8Array, options: PdfThreadOptions = {}): Promise<ExtractedPage[]> {
  const { workerUrl = new URL('./pdf-thread.ts', import.meta.url), timeoutMs = 30000 } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new Error('PDF timeout must be positive int32 milliseconds');
  const buffer = new Uint8Array(bytes).buffer;
  return new Promise((resolve, reject) => {
    // Node 24 strips TypeScript in this thread without inheriting tsx or test-runner flags.
    const worker = new Worker(workerUrl, { workerData: { bytes: buffer }, transferList: [buffer], execArgv: [] });
    let settled = false;
    // Terminate the per-document thread before resolving its result or failure.
    const finish = (error?: Error, pages?: ExtractedPage[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate().then(() => error ? reject(error) : resolve(pages!), reject);
    };
    const timeout = setTimeout(() => finish(new Error('PDF parsing timed out')), timeoutMs);
    worker.once('message', (pages: ExtractedPage[]) => finish(undefined, pages));
    worker.once('error', (error) => finish(error instanceof Error ? error : new Error(String(error))));
    worker.once('exit', (code) => { if (!settled) finish(new Error(`PDF parser exited without a result (code ${code})`)); });
  });
}

// Fetch the private PDF asynchronously and run its CPU-heavy parsing in a worker thread.
export const processPdf: PdfProcessor = async (work) => parsePdfInThread(await getPdf(work.s3Key));
