import { Redis, type RedisOptions } from 'ioredis';
import { loadConfig } from '../config/index.js';
import { createModuleLogger } from '../common/logging/logger.js';

const log = createModuleLogger('key-value');

/**
 * Render Key Value speaks the Redis protocol.
 *
 * Key Value is used for: BullMQ queues, shared rate-limit counters, session
 * caching and Socket.IO pub/sub coordination. It is never the only record of
 * anything permanent — messages, sessions and jobs all have PostgreSQL rows.
 */
let client: Redis | undefined;
let subscriber: Redis | undefined;

function buildOptions(): RedisOptions {
  const config = loadConfig();
  return {
    ...(config.keyValue.tls ? { tls: {} } : {}),
    maxRetriesPerRequest: null, // Required by BullMQ.
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      // Bounded exponential backoff, capped at 10s.
      return Math.min(times * 200, 10_000);
    },
  };
}

export function getKeyValue(): Redis {
  const config = loadConfig();
  if (!config.keyValue.url) {
    throw new Error('Key Value is not configured (KEY_VALUE_URL is unset).');
  }
  client ??= new Redis(config.keyValue.url, buildOptions());

  if (!client.listenerCount('error')) {
    client.on('error', (error) => {
      log.error({ err: error }, 'key value error');
    });
  }

  return client;
}

/** A dedicated connection for subscriptions; a subscribed client cannot issue commands. */
export function getKeyValueSubscriber(): Redis {
  const config = loadConfig();
  if (!config.keyValue.url) {
    throw new Error('Key Value is not configured (KEY_VALUE_URL is unset).');
  }
  subscriber ??= new Redis(config.keyValue.url, buildOptions());

  if (!subscriber.listenerCount('error')) {
    subscriber.on('error', (error) => {
      log.error({ err: error }, 'key value subscriber error');
    });
  }

  return subscriber;
}

export function isKeyValueConfigured(): boolean {
  return loadConfig().keyValue.enabled;
}

export async function connectKeyValue(): Promise<void> {
  if (!isKeyValueConfigured()) {
    log.warn('key value not configured; queues, caching and socket scaling are disabled');
    return;
  }
  const instance = getKeyValue();
  if (instance.status === 'wait') {
    await instance.connect();
  }
  await instance.ping();
  log.info('key value connected');
}

export async function disconnectKeyValue(): Promise<void> {
  const closing: Promise<unknown>[] = [];
  if (client) closing.push(client.quit().catch(() => client?.disconnect()));
  if (subscriber) closing.push(subscriber.quit().catch(() => subscriber?.disconnect()));
  await Promise.allSettled(closing);
  client = undefined;
  subscriber = undefined;
  log.info('key value disconnected');
}

export async function checkKeyValueHealth(): Promise<boolean> {
  if (!isKeyValueConfigured()) return false;
  try {
    const result = await getKeyValue().ping();
    return result === 'PONG';
  } catch (error) {
    log.error({ err: error }, 'key value health check failed');
    return false;
  }
}

export { Redis };
