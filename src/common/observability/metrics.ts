import { createModuleLogger } from '../logging/logger.js';

const log = createModuleLogger('metrics');

/**
 * Lightweight in-process metrics.
 *
 * This is intentionally a counter/gauge registry rather than a Prometheus
 * client: the MVP needs structured operational signals (queue depth, failed
 * jobs, upload and email failures, socket connections) that can be logged and
 * scraped from Render's log stream. Swapping in a real metrics backend means
 * replacing `snapshot()`'s consumer, not the call sites.
 */

type MetricKind = 'counter' | 'gauge';

interface MetricRecord {
  kind: MetricKind;
  name: string;
  help: string;
  value: number;
  labels: Record<string, string>;
}

const registry = new Map<string, MetricRecord>();

function key(name: string, labels: Record<string, string>): string {
  const labelPart = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
  return labelPart ? `${name}{${labelPart}}` : name;
}

export function increment(
  name: string,
  labels: Record<string, string> = {},
  amount = 1,
  help = '',
): void {
  const id = key(name, labels);
  const existing = registry.get(id);
  if (existing) {
    existing.value += amount;
    return;
  }
  registry.set(id, { kind: 'counter', name, help, value: amount, labels });
}

export function setGauge(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  help = '',
): void {
  const id = key(name, labels);
  const existing = registry.get(id);
  if (existing) {
    existing.value = value;
    return;
  }
  registry.set(id, { kind: 'gauge', name, help, value, labels });
}

export function observeDuration(
  name: string,
  durationMs: number,
  labels: Record<string, string> = {},
): void {
  increment(`${name}_count`, labels, 1, 'Number of observations.');
  increment(`${name}_sum_ms`, labels, durationMs, 'Total observed duration in milliseconds.');
}

/** Snapshot for a metrics endpoint or periodic log emission. */
export function snapshot(): MetricRecord[] {
  return [...registry.values()].map((record) => ({ ...record, labels: { ...record.labels } }));
}

export function resetMetrics(): void {
  registry.clear();
}

/** Periodically emit the registry to the log stream for Render log drains. */
export function startMetricsReporter(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    const records = snapshot();
    if (records.length === 0) return;
    log.info({ metrics: records }, 'metrics snapshot');
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** Well-known metric names, kept in one place so dashboards stay stable. */
export const MetricName = {
  HTTP_REQUEST: 'http_request',
  HTTP_ERROR: 'http_error',
  DB_QUERY_SLOW: 'db_query_slow',
  QUEUE_DEPTH: 'queue_depth',
  JOB_FAILED: 'job_failed',
  JOB_COMPLETED: 'job_completed',
  SOCKET_CONNECTIONS: 'socket_connections',
  UPLOAD_FAILURE: 'upload_failure',
  FILE_SCAN_COMPLETED: 'file_scan_completed',
  EMAIL_FAILURE: 'email_failure',
  OUTBOX_PUBLISHED: 'outbox_published',
  OUTBOX_FAILED: 'outbox_failed',
} as const;
