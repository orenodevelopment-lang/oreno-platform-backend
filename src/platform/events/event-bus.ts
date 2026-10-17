import type { DomainEvent, EventKey } from './event-catalog.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { serialiseError } from '../../common/logging/logger.js';
import { increment, MetricName } from '../../common/observability/metrics.js';

const log = createModuleLogger('event-bus');

/**
 * In-process handler registry.
 *
 * The API process registers nothing; the worker process registers every
 * handler at boot. Keeping the registry explicit (rather than convention-based
 * auto-discovery) means the set of side effects a domain change can trigger is
 * visible in one file, which matters when reasoning about what a deletion or a
 * status change actually does.
 */
export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

interface Registration {
  key: EventKey;
  handler: EventHandler<never>;
  name: string;
}

const handlers = new Map<EventKey, Registration[]>();

export function registerEventHandler<T>(
  key: EventKey,
  name: string,
  handler: EventHandler<T>,
): void {
  const list = handlers.get(key) ?? [];
  if (list.some((registration) => registration.name === name)) {
    throw new Error(`Duplicate event handler registration: ${key} / ${name}`);
  }
  list.push({ key, name, handler });
  handlers.set(key, list);
}

export function registeredEventKeys(): EventKey[] {
  return [...handlers.keys()];
}

export function clearEventHandlers(): void {
  handlers.clear();
}

export interface DispatchResult {
  key: EventKey;
  handlersRun: number;
  failures: { handler: string; error: unknown }[];
}

/**
 * Run every handler for an event.
 *
 * Handlers run sequentially and a failure does not stop the others: a broken
 * notification handler must not prevent a search-index update. Failures are
 * collected and returned so the caller (the worker) can decide whether to
 * retry the whole event.
 */
export async function dispatchDomainEvent(event: DomainEvent): Promise<DispatchResult> {
  const registrations = handlers.get(event.key) ?? [];
  const failures: { handler: string; error: unknown }[] = [];
  let handlersRun = 0;

  for (const registration of registrations) {
    try {
      await registration.handler(event as DomainEvent<never>);
      handlersRun += 1;
    } catch (error) {
      failures.push({ handler: registration.name, error });
      increment(MetricName.JOB_FAILED, { handler: registration.name, event: event.key });
      log.error(
        {
          err: serialiseError(error),
          eventKey: event.key,
          eventId: event.id,
          handler: registration.name,
        },
        'event handler failed',
      );
    }
  }

  if (registrations.length === 0) {
    // Not an error: plenty of events exist for audit and future use only.
    log.debug({ eventKey: event.key }, 'no handlers registered for event');
  }

  return { key: event.key, handlersRun, failures };
}
