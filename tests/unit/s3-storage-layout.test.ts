import { describe, expect, it } from 'vitest';
import { prefixObjectKey } from '../../src/platform/storage/s3-storage.adapter.js';

describe('S3 two-bucket object layout', () => {
  it('places logical application keys under their configured prefix', () => {
    expect(prefixObjectKey('public', 'organisation/logo.png')).toBe('public/organisation/logo.png');
    expect(prefixObjectKey('private', 'organisation/contract.pdf')).toBe(
      'private/organisation/contract.pdf',
    );
    expect(prefixObjectKey('exports', 'organisation/payroll.csv')).toBe(
      'exports/organisation/payroll.csv',
    );
  });

  it('keeps quarantine and legacy bucket keys unchanged', () => {
    expect(prefixObjectKey('', 'organisation/upload.pdf')).toBe('organisation/upload.pdf');
  });

  it('normalises boundary slashes without changing key segments', () => {
    expect(prefixObjectKey('/private/', '/organisation/folder name/file.pdf')).toBe(
      'private/organisation/folder name/file.pdf',
    );
  });
});
