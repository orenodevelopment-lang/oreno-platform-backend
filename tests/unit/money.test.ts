import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  applyMultiplier,
  compare,
  CurrencyMismatchError,
  currencyExponent,
  hoursToMinutes,
  isNegative,
  minutesToHours,
  money,
  multiply,
  parseAmount,
  round,
  serialise,
  subtract,
  sum,
} from '../../src/common/money/money.js';

describe('money', () => {
  describe('currencyExponent', () => {
    it('defaults to two minor units', () => {
      expect(currencyExponent('USD')).toBe(2);
      expect(currencyExponent('gbp')).toBe(2);
    });

    it('knows zero-decimal currencies', () => {
      expect(currencyExponent('JPY')).toBe(0);
      expect(currencyExponent('KRW')).toBe(0);
    });

    it('knows three-decimal currencies', () => {
      expect(currencyExponent('KWD')).toBe(3);
      expect(currencyExponent('BHD')).toBe(3);
    });
  });

  describe('arithmetic', () => {
    it('adds without binary floating point drift', () => {
      const result = add(money('0.1', 'USD'), money('0.2', 'USD'));
      expect(result.amount.toFixed(2)).toBe('0.30');
    });

    it('subtracts', () => {
      expect(subtract(money('10.00', 'USD'), money('2.50', 'USD')).amount.toFixed(2)).toBe('7.50');
    });

    it('multiplies by a factor', () => {
      expect(multiply(money('100.00', 'USD'), '1.5').amount.toFixed(2)).toBe('150.00');
    });

    it('sums a list', () => {
      const total = sum([money('1.10', 'USD'), money('2.20', 'USD'), money('3.30', 'USD')], 'USD');
      expect(total.amount.toFixed(2)).toBe('6.60');
    });

    it('returns zero for an empty list', () => {
      expect(sum([], 'EUR').amount.toFixed(2)).toBe('0.00');
    });

    it('refuses to combine different currencies', () => {
      expect(() => add(money('1', 'USD'), money('1', 'EUR'))).toThrow(CurrencyMismatchError);
    });
  });

  describe('rounding', () => {
    it('rounds half up to the currency minor unit', () => {
      expect(round(money('1.005', 'USD')).amount.toFixed(2)).toBe('1.01');
      expect(round(money('1.004', 'USD')).amount.toFixed(2)).toBe('1.00');
    });

    it('respects zero-decimal currencies', () => {
      expect(round(money('10.4', 'JPY')).amount.toFixed(0)).toBe('10');
      expect(round(money('10.5', 'JPY')).amount.toFixed(0)).toBe('11');
    });

    it('applies a multiplier and rounds in one step', () => {
      expect(applyMultiplier(money('19.99', 'USD'), '1.5').amount.toFixed(2)).toBe('29.99');
    });
  });

  describe('comparison', () => {
    it('orders amounts', () => {
      expect(compare(money('2', 'USD'), money('1', 'USD'))).toBeGreaterThan(0);
      expect(compare(money('1', 'USD'), money('2', 'USD'))).toBeLessThan(0);
      expect(compare(money('1', 'USD'), money('1', 'USD'))).toBe(0);
    });

    it('detects negatives', () => {
      expect(isNegative(money('-1', 'USD'))).toBe(true);
      expect(isNegative(money('1', 'USD'))).toBe(false);
    });

    it('refuses to compare different currencies', () => {
      expect(() => compare(money('1', 'USD'), money('1', 'EUR'))).toThrow(CurrencyMismatchError);
    });
  });

  describe('serialise', () => {
    it('emits a decimal string, never a float', () => {
      expect(serialise(money('5', 'USD'))).toEqual({ amount: '5.00', currency: 'USD' });
      expect(serialise(money('1200', 'JPY'))).toEqual({ amount: '1200', currency: 'JPY' });
    });
  });

  describe('parseAmount', () => {
    it('parses plain decimals', () => {
      expect(parseAmount('12.34').toFixed(2)).toBe('12.34');
      expect(parseAmount('-0.50').toFixed(2)).toBe('-0.50');
    });

    it('rejects scientific notation and junk', () => {
      expect(() => parseAmount('1e3')).toThrow();
      expect(() => parseAmount('abc')).toThrow();
      expect(() => parseAmount('')).toThrow();
    });
  });

  describe('time conversions', () => {
    it('converts minutes to decimal hours', () => {
      expect(minutesToHours(90).toFixed(2)).toBe('1.50');
      expect(minutesToHours(0).toFixed(2)).toBe('0.00');
    });

    it('converts decimal hours back to whole minutes, rounding half up', () => {
      expect(hoursToMinutes('1.5')).toBe(90);
      expect(hoursToMinutes('0.999')).toBe(60);
      expect(hoursToMinutes('0.991')).toBe(59);
    });

    it('round-trips exactly for whole-minute values', () => {
      for (const minutes of [15, 30, 45, 60, 90, 480]) {
        expect(hoursToMinutes(minutesToHours(minutes))).toBe(minutes);
      }
    });
  });

  describe('allocate', () => {
    it('splits a total without losing a minor unit', () => {
      const parts = allocate(money('10.00', 'USD'), [1, 1, 1]);
      const total = sum(parts, 'USD');
      expect(total.amount.toFixed(2)).toBe('10.00');
      expect(parts.map((part) => part.amount.toFixed(2))).toEqual(['3.34', '3.33', '3.33']);
    });

    it('splits proportionally to weights', () => {
      const parts = allocate(money('100.00', 'USD'), [70, 30]);
      expect(parts.map((part) => part.amount.toFixed(2))).toEqual(['70.00', '30.00']);
    });

    it('never invents or drops value across awkward splits', () => {
      const parts = allocate(money('0.05', 'USD'), [1, 1, 1]);
      expect(sum(parts, 'USD').amount.toFixed(2)).toBe('0.05');
    });

    it('rejects weights that sum to zero or less', () => {
      expect(() => allocate(money('10', 'USD'), [0, 0])).toThrow();
      expect(() => allocate(money('10', 'USD'), [])).toThrow();
    });
  });
});
