export type ExtractionJob = {
  id: number;
  courseId: number;
  resourceId: number;
  attempts: number;
};

export type ExtractionWork = ExtractionJob & {
  s3Key: string;
};

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type PdfProcessor = (work: ExtractionWork) => Promise<ExtractedPage[]>;

export type ExtractionRunResult = 'idle' | 'completed' | 'failed' | 'discarded';

export type ExtractionRunnerOptions = {
  signal: AbortSignal;
  pollIntervalMs?: number;
  retryDelayMs?: number;
};

export type PdfThreadInput = {
  bytes: ArrayBuffer;
};

export type PdfThreadOptions = {
  workerUrl?: URL;
  timeoutMs?: number;
};
