import '../src/config/load-env.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildOpenApiDocument } from '../src/openapi/index.js';

/**
 * Write the OpenAPI document, or verify it is current.
 *
 *   tsx scripts/generate-openapi.ts           # write openapi/openapi.json
 *   tsx scripts/generate-openapi.ts --check   # fail if the file is stale
 *
 * `--check` runs in CI. Because the document is built from the same Zod schemas
 * the controllers validate against, a request-shape change that forgets to
 * regenerate the file is caught there rather than by an API consumer.
 */
const OUTPUT_PATH = resolve(process.cwd(), 'openapi', 'openapi.json');
const isCheck = process.argv.includes('--check');

function serialise(): string {
  // A trailing newline keeps the file diff-friendly and Prettier-stable.
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}

function main(): void {
  const generated = serialise();

  if (isCheck) {
    let existing: string;
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      console.error(
        `openapi check failed: ${OUTPUT_PATH} does not exist. Run "npm run openapi:generate".`,
      );
      process.exit(1);
    }

    if (existing !== generated) {
      console.error(
        `openapi check failed: ${OUTPUT_PATH} is stale. Run "npm run openapi:generate" and commit the result.`,
      );
      process.exit(1);
    }

    console.log('openapi check passed: the specification is current.');
    return;
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, generated, 'utf8');

  const operationCount = Object.values(
    JSON.parse(generated).paths as Record<string, Record<string, unknown>>,
  ).reduce((total, methods) => total + Object.keys(methods).length, 0);

  console.log(`wrote ${OUTPUT_PATH} (${operationCount} operations)`);
}

main();
