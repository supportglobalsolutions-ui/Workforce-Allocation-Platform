import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

// Never delete compiler output belonging to a server already running on 3000.
const portAvailable = await new Promise((resolvePort, reject) => {
  const probe = createServer();
  probe.once('error', (error) => {
    if (error.code === 'EADDRINUSE') resolvePort(false);
    else reject(error);
  });
  probe.listen(3000, () => probe.close(() => resolvePort(true)));
});
if (!portAvailable) {
  console.error('Port 3000 is already in use. Stop the existing server before restarting. Its cache has been preserved.');
  process.exit(1);
}

// Next's development compiler can occasionally retain a runtime manifest that
// references chunks removed by Fast Refresh. Starting from a clean cache is
// fast, cross-platform, and prevents the browser from receiving 500 errors for
// its own webpack/runtime files.
const nextCache = resolve('.next');

await rm(nextCache, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
console.log('Cleared stale Next.js development cache.');
