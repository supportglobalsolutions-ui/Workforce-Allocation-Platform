import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// Next's development compiler can occasionally retain a runtime manifest that
// references chunks removed by Fast Refresh. Starting from a clean cache is
// fast, cross-platform, and prevents the browser from receiving 500 errors for
// its own webpack/runtime files.
const nextCache = resolve('.next');

await rm(nextCache, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
console.log('Cleared stale Next.js development cache.');
