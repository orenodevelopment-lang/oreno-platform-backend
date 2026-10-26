export const GUARDDUTY_SCAN_STATUS_TAG = 'GuardDutyMalwareScanStatus';

export const GUARDDUTY_SCAN_STATUSES = {
  CLEAN: 'NO_THREATS_FOUND',
  INFECTED: 'THREATS_FOUND',
  UNSUPPORTED: 'UNSUPPORTED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  FAILED: 'FAILED',
} as const;

export type GuardDutyScanResult =
  | { verdict: 'pending' }
  | { verdict: 'clean'; status: string }
  | { verdict: 'infected'; status: string }
  | { verdict: 'error'; status: string; detail: string };

/** Convert the GuardDuty-managed S3 tag into the file domain's scan result. */
export function interpretGuardDutyTags(tags: Record<string, string>): GuardDutyScanResult {
  const status = tags[GUARDDUTY_SCAN_STATUS_TAG];
  if (!status) return { verdict: 'pending' };

  switch (status) {
    case GUARDDUTY_SCAN_STATUSES.CLEAN:
      return { verdict: 'clean', status };
    case GUARDDUTY_SCAN_STATUSES.INFECTED:
      return { verdict: 'infected', status };
    case GUARDDUTY_SCAN_STATUSES.UNSUPPORTED:
      return { verdict: 'error', status, detail: 'GuardDuty does not support this object.' };
    case GUARDDUTY_SCAN_STATUSES.ACCESS_DENIED:
      return { verdict: 'error', status, detail: 'GuardDuty could not access this object.' };
    case GUARDDUTY_SCAN_STATUSES.FAILED:
      return { verdict: 'error', status, detail: 'GuardDuty could not complete the scan.' };
    default:
      return { verdict: 'error', status, detail: 'GuardDuty returned an unknown scan status.' };
  }
}
