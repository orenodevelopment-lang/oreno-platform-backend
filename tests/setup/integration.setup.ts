import '../../src/config/load-env.js';
import { afterAll, beforeAll } from 'vitest';
import { connectPrisma, disconnectPrisma } from '../../src/database/prisma.js';
import { disconnectKeyValue } from '../../src/database/key-value.js';
import { closeQueues } from '../../src/platform/queue/queue.registry.js';

beforeAll(async () => { await connectPrisma(); });
afterAll(async () => {
  await closeQueues();
  await disconnectKeyValue();
  await disconnectPrisma();
});
