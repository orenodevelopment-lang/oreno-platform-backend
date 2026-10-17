import '../../src/config/load-env.js';
import { afterAll, beforeAll } from 'vitest';
import { connectPrisma, disconnectPrisma } from '../../src/database/prisma.js';

beforeAll(async () => { await connectPrisma(); });
afterAll(async () => { await disconnectPrisma(); });
