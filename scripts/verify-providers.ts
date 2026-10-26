import '../src/config/load-env.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../src/config/index.js';
import {
  initialiseConfiguredErrorMonitor,
  reportError,
} from '../src/common/observability/error-monitor.js';
import { getEmailAdapter } from '../src/platform/email/email.service.js';
import { interpretGuardDutyTags } from '../src/platform/storage/guardduty-scan.js';
import { getMalwareScanner } from '../src/platform/storage/malware-scanner.js';
import { getStorage } from '../src/platform/storage/storage.service.js';

type State = 'passed' | 'skipped' | 'failed';
interface Result { provider: string; state: State; detail: string }

const live = process.argv.includes('--live');
const results: Result[] = [];

async function check(provider: string, run: () => Promise<string>, configured = true) {
  if (!configured) {
    results.push({ provider, state: 'skipped', detail: 'not configured' });
    return;
  }
  if (!live) {
    results.push({ provider, state: 'passed', detail: 'configuration accepted; rerun with --live for network verification' });
    return;
  }
  try {
    results.push({ provider, state: 'passed', detail: await run() });
  } catch (error) {
    results.push({ provider, state: 'failed', detail: error instanceof Error ? error.message : String(error) });
  }
}

async function probeGuardDuty(body: Buffer | string, expected: 'clean' | 'infected'): Promise<string> {
  const config = loadConfig();
  const storage = getStorage();
  const key = `provider-verification/guardduty/${expected}/${randomUUID()}.txt`;
  await storage.putObject({ bucket: 'quarantine', key }, body, 'text/plain');
  try {
    const metadata = await storage.headObject({ bucket: 'quarantine', key });
    if (!metadata?.versionId) throw new Error('quarantine bucket did not return a version ID');
    const location = { bucket: 'quarantine' as const, key, versionId: metadata.versionId };
    const deadline = Date.now() + config.malwareScanner.guardDuty.timeoutMinutes * 60_000;
    while (Date.now() < deadline) {
      const result = interpretGuardDutyTags(await storage.getObjectTags(location));
      if (result.verdict === expected) return `${result.status} tag received for exact object version`;
      if (result.verdict !== 'pending') {
        throw new Error(`expected ${expected}, received ${result.verdict}`);
      }
      await delay(config.malwareScanner.guardDuty.pollSeconds * 1_000);
    }
    throw new Error('timed out waiting for the GuardDuty scan result tag');
  } finally {
    await storage.deleteObject({ bucket: 'quarantine', key });
  }
}

async function main(): Promise<void> {
const config = loadConfig();

await check('email', async () => {
  const recipient = process.env['PROVIDER_TEST_EMAIL_TO'];
  if (!recipient) throw new Error('PROVIDER_TEST_EMAIL_TO is required for a live email probe.');
  const adapter = getEmailAdapter();
  const sent = await adapter.send({
    to: recipient,
    subject: `Oreno provider verification ${new Date().toISOString()}`,
    text: 'This controlled message verifies the configured production email adapter.',
    html: '<p>This controlled message verifies the configured production email adapter.</p>',
    tags: { purpose: 'provider-verification' },
  });
  return `${adapter.name} accepted the probe${sent.providerRef ? ` (${sent.providerRef})` : ''}`;
}, !['log', 'capture'].includes(config.email.provider));

await check('s3', async () => {
  const storage = getStorage();
  const key = `provider-verification/${randomUUID()}.txt`;
  const buckets = config.malwareScanner.driver === 'guardduty'
    ? (['public', 'private', 'exports'] as const)
    : (['public', 'private', 'quarantine', 'exports'] as const);
  for (const bucket of buckets) {
    await storage.putObject({ bucket, key }, 'oreno-provider-verification', 'text/plain');
    const metadata = await storage.headObject({ bucket, key });
    if (!metadata?.size) throw new Error(`${bucket} bucket did not return object metadata.`);
    const body = await storage.getObject({ bucket, key });
    if (body.toString('utf8') !== 'oreno-provider-verification') throw new Error(`${bucket} bucket returned different content.`);
    await storage.deleteObject({ bucket, key });
  }
  return `put/head/get/delete succeeded in ${buckets.length} configured buckets`;
}, config.storage.driver === 's3');

await check('guardduty', async () => {
  return probeGuardDuty('oreno clean provider verification', 'clean');
}, config.malwareScanner.driver === 'guardduty');

await check('guardduty:eicar', async () => {
  const path = process.env['PROVIDER_TEST_GUARDDUTY_EICAR_FILE'];
  if (!path) throw new Error('PROVIDER_TEST_GUARDDUTY_EICAR_FILE is required for this probe.');
  return probeGuardDuty(await readFile(path), 'infected');
}, config.malwareScanner.driver === 'guardduty' && Boolean(process.env['PROVIDER_TEST_GUARDDUTY_EICAR_FILE']));

await check('cloudfront', async () => {
  const storage = getStorage();
  const configuredKey = process.env['PROVIDER_TEST_CLOUDFRONT_OBJECT_KEY'];
  if (!configuredKey) throw new Error('PROVIDER_TEST_CLOUDFRONT_OBJECT_KEY is required for a live distribution probe.');
  const url = await storage.publicUrl(configuredKey, 120);
  const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`CloudFront returned ${response.status}.`);
  return `signed delivery returned ${response.status}`;
}, config.cloudfront.enabled);

await check('clamav', async () => {
  const result = await getMalwareScanner().scan(Buffer.from('oreno clean provider verification'));
  if (result.verdict !== 'clean') throw new Error(result.detail ?? `unexpected verdict: ${result.verdict}`);
  return 'clean INSTREAM probe accepted';
}, config.malwareScanner.driver === 'clamav');

for (const provider of ['google', 'linkedin'] as const) {
  const providerConfig = config.auth[provider];
  const endpoint = provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://www.linkedin.com/oauth/v2/authorization';
  await check(`oauth:${provider}`, async () => {
    const response = await fetch(endpoint, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (response.status >= 500) throw new Error(`${provider} authorization endpoint returned ${response.status}.`);
    return `configuration is complete and authorization endpoint returned ${response.status}`;
  }, Boolean(providerConfig));
}

await check('error-monitoring', async () => {
  const flush = initialiseConfiguredErrorMonitor();
  reportError(new Error('Oreno provider verification event'), { route: 'scripts/verify-providers', verification: true });
  await flush();
  return 'test event submitted and transport flushed';
}, Boolean(config.observability.errorMonitoringDsn));

console.table(results);
if (results.some((result) => result.state === 'failed')) process.exitCode = 1;
}

void main();
