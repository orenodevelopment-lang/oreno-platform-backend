import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

/**
 * Shared Vitest settings. The individual suites are declared in
 * `vitest.workspace.ts`, which is what lets `npm run test:unit` and
 * `npm run test:integration` select a suite by name.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    environment: 'node',
    reporters: ['default'],
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
