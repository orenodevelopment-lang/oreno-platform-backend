import type { Options } from 'express-rate-limit';
import { getKeyValue } from '../../database/key-value.js';
import { createModuleLogger } from '../logging/logger.js';

const log = createModuleLogger('rate-limit');

/**
 * A fixed-window rate-limit store backed by Key Value (Redis).
 *
 * The in-process store resets on every deploy and is per-instance, so with more
 * than one Render instance a caller effectively gets N times the configured
 * budget. This store keeps a single counter per key per window, shared by every
 * instance.
 *
 * The increment is a Lua script so the counter and its expiry are set without a
 * race: a plain `INCR` followed by a separate `PEXPIRE` can leave a key with no
 * TTL if the process dies between the two, which would lock a caller out
 * permanently.
 */
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

function namespaced(prefix: string, key: string): string {
  return `rl:${prefix}:${key}`;
}

export function createRateLimitStore(prefix: string): Options['store'] {
  const redis = getKeyValue();
  let windowMs = 60_000;

  return {
    prefix,
    localKeys: false,

    init(options: Options): void {
      windowMs = options.windowMs;
    },

    async increment(key: string) {
      // `eval` is typed as returning `any`; going through `unknown` keeps the
      // result honest and lets the script's shape be asserted in one place.
      const result: unknown = await redis.eval(
        INCREMENT_SCRIPT,
        1,
        namespaced(prefix, key),
        String(windowMs),
      );
      const [totalHits, ttl] = result as [number, number];
      return {
        totalHits,
        // A missing expiry (-1) or missing key (-2) should not happen, but
        // falling back to the full window is safer than reporting `undefined`
        // and letting the caller treat the request as unlimited.
        resetTime: new Date(Date.now() + (ttl > 0 ? ttl : windowMs)),
      };
    },

    async decrement(key: string): Promise<void> {
      // `skipSuccessfulRequests` decrements after a successful response. Floor
      // at zero so a stale decrement cannot make the counter negative.
      const value = await redis.decr(namespaced(prefix, key));
      if (value < 0) await redis.set(namespaced(prefix, key), '0');
    },

    async resetKey(key: string): Promise<void> {
      await redis.del(namespaced(prefix, key));
    },

    shutdown(): void {
      // The connection is owned by `database/key-value.ts` and closed on process
      // shutdown; the store must not close a client other callers still use.
      log.debug({ prefix }, 'rate-limit store released');
    },
  };
}
