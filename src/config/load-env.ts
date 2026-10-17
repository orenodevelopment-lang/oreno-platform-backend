import dotenv from 'dotenv';

/**
 * Load `.env` into `process.env` before anything reads configuration.
 *
 * This is imported for its side effect as the first import of `server.ts` and
 * `worker.ts`. It must stay a separate module: ESM evaluates imports in order,
 * and configuration is parsed lazily on first `loadConfig()`, which several
 * modules call at import time. Loading the file inline in the entry points would
 * run after those imports had already parsed an empty environment.
 *
 * `dotenv` does not overwrite variables that are already set, so a real
 * environment (Render, Docker, CI) always wins over the file.
 */
dotenv.config();
