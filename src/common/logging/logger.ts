import pino, { type Logger, type LoggerOptions } from 'pino';
import { getContext } from './context.js';
import { redact, stripUrlSecrets } from './redaction.js';

export interface LoggerConfig {
  level: string;
  serviceName: string;
  isProduction: boolean;
}

let rootLogger: Logger | undefined;

function buildOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.level,
    base: {
      service: config.serviceName,
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Merge the active request context into every record automatically.
    mixin() {
      const context = getContext();
      if (!context) return {};
      return {
        requestId: context.requestId,
        correlationId: context.correlationId,
        ...(context.userId ? { userId: context.userId } : {}),
        ...(context.organisationId ? { organisationId: context.organisationId } : {}),
        ...(context.module ? { module: context.module } : {}),
        ...(context.impersonatedByUserId
          ? { impersonatedByUserId: context.impersonatedByUserId }
          : {}),
      };
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    // Defence in depth: even a careless `logger.info({ password })` is scrubbed.
    hooks: {
      logMethod(args, method) {
        const sanitised = args.map((arg) =>
          typeof arg === 'object' && arg !== null ? redact(arg) : arg,
        );
        return method.apply(this, sanitised as Parameters<typeof method>);
      },
    },
    transport: config.isProduction
      ? undefined
      : {
          target: 'pino/file',
          options: { destination: 1 },
        },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'token',
        'secret',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  };
}

export function initLogger(config: LoggerConfig): Logger {
  rootLogger = pino(buildOptions(config));
  return rootLogger;
}

export function getLogger(): Logger {
  if (!rootLogger) {
    // Fallback for modules imported before explicit initialisation (e.g. tests).
    rootLogger = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: process.env.SERVICE_NAME ?? 'oreno-api', pid: process.pid },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return rootLogger;
}

/** Create a logger bound to a module name for clearer log attribution. */
export function createModuleLogger(module: string): Logger {
  return getLogger().child({ module });
}

/** Serialise an error for logging without leaking internal detail to responses. */
export function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: stripUrlSecrets(error.message),
      ...(error.stack ? { stack: error.stack.split('\n').slice(0, 8).join('\n') } : {}),
      ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
      ...(error.cause ? { cause: serialiseError(error.cause) } : {}),
    };
  }
  return { message: stripUrlSecrets(String(error)) };
}

export type { Logger };
