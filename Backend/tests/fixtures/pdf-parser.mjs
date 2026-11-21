import { parentPort, workerData, threadId, isMainThread } from 'node:worker_threads';

const mode = new TextDecoder().decode(workerData.bytes);
if (mode === 'crash') throw new Error('Test parser failed');
if (mode === 'exit') process.exit(0);
if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else {
  parentPort.postMessage([{ pageNumber: 1, text: `${isMainThread}:${threadId}:${mode}` }]);
}
