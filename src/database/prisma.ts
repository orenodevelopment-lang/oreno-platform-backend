import { Prisma, PrismaClient } from '@prisma/client';
import { loadConfig } from '../config/index.js';
import { createModuleLogger } from '../common/logging/logger.js';

const log = createModuleLogger('database');

/**
 * One process-wide Prisma client. Both the API and the worker create exactly
 * one; repositories receive it rather than opening their own connections.
 */
let client: PrismaClient | undefined;

export function createPrismaClient(): PrismaClient {
  const config = loadConfig();

  const instance = new PrismaClient({
    log: config.isProduction
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
    errorFormat: config.isProduction ? 'minimal' : 'pretty',
  });

  instance.$on('error', (event) => {
    log.error({ prismaError: event.message }, 'prisma error');
  });
  instance.$on('warn', (event) => {
    log.warn({ prismaWarning: event.message }, 'prisma warning');
  });

  return instance;
}

export function getPrisma(): PrismaClient {
  client ??= createPrismaClient();
  return client;
}

export async function connectPrisma(): Promise<void> {
  const instance = getPrisma();
  await instance.$connect();
  log.info('database connected');
}

export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  log.info('database disconnected');
}

/** Liveness probe used by the readiness endpoint. */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log.error({ err: error }, 'database health check failed');
    return false;
  }
}

export type { PrismaClient };
export { Prisma };
