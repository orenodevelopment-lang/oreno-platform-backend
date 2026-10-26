import { describe, expect, it } from 'vitest';
import {
  GUARDDUTY_SCAN_STATUS_TAG,
  interpretGuardDutyTags,
} from '../../src/platform/storage/guardduty-scan.js';

describe('GuardDuty malware scan tags', () => {
  it('keeps an object pending until GuardDuty writes a result tag', () => {
    expect(interpretGuardDutyTags({})).toEqual({ verdict: 'pending' });
  });

  it.each([
    ['NO_THREATS_FOUND', 'clean'],
    ['THREATS_FOUND', 'infected'],
    ['UNSUPPORTED', 'error'],
    ['ACCESS_DENIED', 'error'],
    ['FAILED', 'error'],
    ['NEW_PROVIDER_STATUS', 'error'],
  ] as const)('maps %s to %s', (status, verdict) => {
    expect(interpretGuardDutyTags({ [GUARDDUTY_SCAN_STATUS_TAG]: status })).toMatchObject({
      verdict,
      status,
    });
  });
});
