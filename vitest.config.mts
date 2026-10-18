import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

/** Vitest 5 projects keep the database-backed suites serial and independently selectable. */
export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    environment: 'node',
    reporters: ['default'],
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup/integration.setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'http',
          include: ['tests/http/**/*.test.ts'],
          setupFiles: ['tests/setup/http.setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.types.ts',
        'src/**/*.routes.ts',
        'src/**/*.schema.ts',
        'src/server.ts',
        'src/worker.ts',
      ],
    },
  },
});
