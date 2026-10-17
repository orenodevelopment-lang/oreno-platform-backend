import { z } from 'zod';
import type { OperationDoc } from './openapi.types.js';

/**
 * Liveness, readiness and metrics.
 *
 * These are mounted outside `/api`, are unauthenticated, and are deliberately
 * excluded from the access log so a probe loop cannot drown the log pipeline.
 */
const TAG = 'health';

const identity = {
  service: z.string(),
  environment: z.string(),
};

export const healthOperations: OperationDoc[] = [
  {
    method: 'get',
    path: '/health',
    operationId: 'healthCheck',
    summary: 'Service identity and uptime',
    tags: [TAG],
    security: [],
    responses: [
      {
        status: 200,
        description: 'The process is running.',
        schema: z.object({ status: z.literal('ok'), ...identity, uptimeSeconds: z.number().int() }),
      },
    ],
  },
  {
    method: 'get',
    path: '/health/live',
    operationId: 'healthLive',
    summary: 'Liveness probe',
    description:
      'Answers whether the process is running. Must never touch a dependency: a failing database should not cause an orchestrator to restart a healthy process.',
    tags: [TAG],
    security: [],
    responses: [
      {
        status: 200,
        description: 'The process is running.',
        schema: z.object({ status: z.literal('ok'), ...identity }),
      },
    ],
  },
  {
    method: 'get',
    path: '/health/ready',
    operationId: 'healthReady',
    summary: 'Readiness probe',
    description:
      'Answers whether the process can serve traffic by checking its dependencies. Responds `503` when a required dependency is unavailable so a load balancer holds traffic back.',
    tags: [TAG],
    security: [],
    responses: [
      {
        status: 200,
        description: 'Every required dependency is reachable.',
        schema: z.object({
          status: z.literal('ready'),
          ...identity,
          checks: z.object({
            database: z.enum(['ok', 'unavailable']),
            keyValue: z.enum(['ok', 'unavailable', 'not_configured']),
          }),
        }),
      },
      {
        status: 503,
        description: 'At least one required dependency is unavailable.',
        schema: z.object({
          status: z.literal('degraded'),
          ...identity,
          checks: z.object({
            database: z.enum(['ok', 'unavailable']),
            keyValue: z.enum(['ok', 'unavailable', 'not_configured']),
          }),
        }),
      },
    ],
  },
  {
    method: 'get',
    path: '/health/startup',
    operationId: 'healthStartup',
    summary: 'Startup probe',
    tags: [TAG],
    security: [],
    responses: [
      {
        status: 200,
        description: 'Startup checks have completed.',
        schema: z.object({ status: z.literal('ok'), ...identity }),
      },
    ],
  },
  {
    method: 'get',
    path: '/metrics',
    operationId: 'metricsSnapshot',
    summary: 'In-process metrics snapshot',
    description:
      'Only mounted when `METRICS_ENABLED=true`. Exposes counters and histograms as JSON to keep the deployment free of a Prometheus sidecar.',
    tags: [TAG],
    security: [],
    responses: [
      {
        status: 200,
        description: 'A point-in-time snapshot of the in-process metrics registry.',
        schema: z.object({ metrics: z.record(z.unknown()) }),
      },
    ],
  },
];
