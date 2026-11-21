import { parentPort, workerData } from 'node:worker_threads';
import { parsePdf } from './pdf-parser.ts';
import type { PdfThreadInput } from '../types/extraction.ts';

if (!parentPort) throw new Error('PDF parsing must run inside a worker thread');
const { bytes } = workerData as PdfThreadInput;
if (!(bytes instanceof ArrayBuffer)) throw new Error('PDF worker requires document bytes');
parentPort.postMessage(await parsePdf(new Uint8Array(bytes)));
