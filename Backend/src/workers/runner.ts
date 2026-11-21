import { setTimeout } from 'node:timers/promises';
import { processNextExtraction } from './extraction';
import type { PdfProcessor, ExtractionRunnerOptions } from '../types';

// Wait between attempts while allowing shutdown to interrupt the polling delay.
async function pause(delay: number, signal: AbortSignal): Promise<void> {
  try { await setTimeout(delay, undefined, { signal }); }
  catch (error) { if (!signal.aborted) throw error; }
}

// Poll sequentially until shutdown and finish the current extraction before returning.
export async function runExtractionWorker(processPdf: PdfProcessor, options: ExtractionRunnerOptions): Promise<void> {
  const { signal, pollIntervalMs = 2000, retryDelayMs = 5000 } = options;
  for (const delay of [pollIntervalMs, retryDelayMs]) {
    if (!Number.isInteger(delay) || delay < 1 || delay > 2147483647) throw new Error('Worker delays must be positive int32 milliseconds');
  }
  while (!signal.aborted) {
    let delay = pollIntervalMs;
    try {
      const result = await processNextExtraction(processPdf);
      if (result === 'completed' || result === 'discarded') continue;
      if (result === 'failed') delay = retryDelayMs;
    } catch (error) {
      console.error('Extraction worker iteration failed:', error);
      delay = retryDelayMs;
    }
    if (!signal.aborted) await pause(delay, signal);
  }
}
