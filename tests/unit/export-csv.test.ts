import { describe, expect, it } from 'vitest';
import { renderCsv } from '../../src/modules/exports/export.service.js';

describe('CSV export rendering', () => {
  it('neutralises spreadsheet formulas and quotes CSV metacharacters', () => {
    const csv = renderCsv([
      { name: '=HYPERLINK("https://example.invalid")', note: 'comma, quote " and\nnewline', amount: '12.50' },
      { name: '+SUM(1,1)', note: '@unsafe', amount: '-10' },
    ], []);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM(1,1)");
    expect(csv).toContain("'@unsafe");
    expect(csv).toContain("'-10");
    expect(csv).toContain('"comma, quote "" and\nnewline"');
  });

  it('uses stable fallback headers for an empty export', () => {
    expect(renderCsv([], ['id', 'status'])).toBe('\uFEFFid,status\r\n');
  });
});
