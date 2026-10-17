import { defineWorkspace } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

/**
 * Three suites with deliberately different guarantees:
 *
 *   unit        — pure functions, no I/O, safe to parallelise.
 *   integration — real PostgreSQL and Key Value; serial, because they share a
 *                 database and truncate between cases.
 *   http        — boots the Express application against the integration
 *                 database and exercises routes end to end; also serial.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'unit',
      environment: 'node',
      include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'integration',
      environment: 'node',
      include: ['tests/integration/**/*.test.ts'],
      setupFiles: ['tests/setup/integration.setup.ts'],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'http',
      environment: 'node',
      include: ['tests/http/**/*.test.ts'],
      setupFiles: ['tests/setup/http.setup.ts'],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
]);
