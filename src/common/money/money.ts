import { Prisma } from '@prisma/client';

/**
 * Money handling.
 *
 * All monetary arithmetic in Oreno goes through `Prisma.Decimal` (decimal.js).
 * JavaScript `number` is never used for money: `0.1 + 0.2 !== 0.3` in binary
 * floating point, and payroll totals must reconcile exactly.
 *
 * Every amount carries an explicit ISO-4217 currency code alongside it, and
 * arithmetic across differing currencies is refused rather than silently
 * coerced.
 */

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

/** Minor-unit exponent per currency. Most currencies use 2. */
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  XOF: 0,
  XAF: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  TND: 3,
};

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly left: string,
    public readonly right: string,
  ) {
    super(`Cannot combine amounts in different currencies: ${left} and ${right}.`);
    this.name = 'CurrencyMismatchError';
  }
}

export interface Money {
  amount: Decimal;
  currency: string;
}

export function money(amount: string | number | Decimal, currency: string): Money {
  return { amount: new Decimal(amount), currency: currency.toUpperCase() };
}

export function zero(currency: string): Money {
  return { amount: new Decimal(0), currency: currency.toUpperCase() };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount.plus(b.amount), currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount.minus(b.amount), currency: a.currency };
}

export function multiply(a: Money, factor: string | number | Decimal): Money {
  return { amount: a.amount.times(new Decimal(factor)), currency: a.currency };
}

export function sum(amounts: readonly Money[], currency: string): Money {
  return amounts.reduce((total, item) => add(total, item), zero(currency));
}

/** Round to the currency's minor unit using banker's-safe half-up rounding. */
export function round(value: Money): Money {
  const exponent = currencyExponent(value.currency);
  return {
    amount: value.amount.toDecimalPlaces(exponent, Decimal.ROUND_HALF_UP),
    currency: value.currency,
  };
}

export function isNegative(value: Money): boolean {
  return value.amount.isNegative();
}

export function isZero(value: Money): boolean {
  return value.amount.isZero();
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount.comparedTo(b.amount);
}

/** Serialise for API responses: a decimal-safe string, never a float. */
export function serialise(value: Money): { amount: string; currency: string } {
  return {
    amount: value.amount.toFixed(currencyExponent(value.currency)),
    currency: value.currency,
  };
}

export function toDecimalString(value: Decimal, places?: number): string {
  return places === undefined ? value.toString() : value.toFixed(places);
}

/** Parse an API-supplied decimal string. Rejects NaN, Infinity and exponents. */
export function parseAmount(input: string): Decimal {
  if (!/^-?\d+(\.\d+)?$/.test(input.trim())) {
    throw new Error(`Invalid decimal amount: "${input}".`);
  }
  return new Decimal(input.trim());
}

/** Convert integer minutes to a decimal hour count (60 minutes = 1 hour). */
export function minutesToHours(minutes: number): Decimal {
  return new Decimal(minutes).dividedBy(60);
}

/** Convert decimal hours to whole minutes, rounding half up. */
export function hoursToMinutes(hours: Decimal | string | number): number {
  return new Decimal(hours).times(60).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Compute a percentage of a money value, e.g. an overtime multiplier applied
 * to a base amount. Result is rounded to the currency's minor unit.
 */
export function applyMultiplier(base: Money, multiplier: string | number | Decimal): Money {
  return round(multiply(base, multiplier));
}

/**
 * Split a total across weights without losing or inventing minor units: the
 * largest-remainder method guarantees the parts sum exactly to the total.
 */
export function allocate(total: Money, weights: readonly number[]): Money[] {
  const totalWeight = weights.reduce((sumValue, weight) => sumValue + weight, 0);
  if (totalWeight <= 0) {
    throw new Error('Allocation weights must sum to a positive value.');
  }

  const exponent = currencyExponent(total.currency);
  const scale = new Decimal(10).pow(exponent);
  const scaledTotal = total.amount
    .times(scale)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  const shares = weights.map((weight) => (scaledTotal * weight) / totalWeight);
  const floored = shares.map((share) => Math.floor(share));
  let remainder = scaledTotal - floored.reduce((sumValue, value) => sumValue + value, 0);

  // Distribute remaining minor units to the largest fractional parts.
  const order = shares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floored];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }

  return result.map((value) => ({
    amount: new Decimal(value).dividedBy(scale),
    currency: total.currency,
  }));
}
