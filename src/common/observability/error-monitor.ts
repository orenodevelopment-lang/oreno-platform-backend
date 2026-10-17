import { createModuleLogger } from '../logging/logger.js';
import { redact } from '../logging/redaction.js';

const log = createModuleLogger('error-monitor');

export interface ErrorReportContext {
  requestId?: string;
  route?: string;
  method?: string;
  userId?: string;
  organisationId?: string;
  [key: string]: unknown;
}

/**
 * Error-monitoring adapter.
 *
 * The concrete provider (Sentry, Rollbar, OpenTelemetry, …) is deliberately not
 * hard-wired: `ERROR_MONITORING_DSN` is read at startup and, when absent, this
 * becomes a structured-log sink. Swapping in a provider means implementing
 * `ErrorMonitorAdapter` and registering it — no domain code changes.
 */
export interface ErrorMonitorAdapter {
  readonly name: string;
  capture(error: unknown, context: ErrorReportContext): void;
}

/** Default adapter: structured logs only. Always safe, never sends externally. */
const logAdapter: ErrorMonitorAdapter = {
  name: 'log',
  capture(error, context) {
    const safeContext = redact(context);
    log.error(
      {
        ...(typeof safeContext === 'object' && safeContext !== null ? safeContext : {}),
        error: redact(error),
      },
      'captured error',
    );
  },
};

let adapter: ErrorMonitorAdapter = logAdapter;

export function registerErrorMonitor(next: ErrorMonitorAdapter): void {
  adapter = next;
  log.info({ adapter: next.name }, 'error monitor registered');
}

/** True when a real monitoring provider is configured. */
export function isErrorMonitoringEnabled(): boolean {
  return adapter.name !== 'log';
}

export function reportError(error: unknown, context: ErrorReportContext = {}): void {
  try {
    adapter.capture(error, context);
  } catch (reportingFailure) {
    // Monitoring must never take down the request path.
    log.error({ err: reportingFailure }, 'error monitor adapter failed');
  }
}
