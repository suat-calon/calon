/**
 * Money — Immutable decimal value object.
 *
 * Wraps Prisma.Decimal (decimal.js) for precision arithmetic.
 * Implements DecimalJsLike so instances can be passed directly to
 * Prisma `Decimal` fields in create/update operations without conversion.
 *
 * Service layer code constructs Money instead of `new Prisma.Decimal()`.
 * The @calon/database package is the only place Prisma.Decimal is referenced.
 */

import { Prisma } from '@prisma/client';

// ── Public type ───────────────────────────────────────────────────────────────

/**
 * MoneyLike — anything the Money constructor accepts.
 * Replaces `Prisma.Decimal | number | string` type annotations in service layer.
 */
export type MoneyLike = Money | number | string;

// ── Money class ───────────────────────────────────────────────────────────────

export class Money {
  private readonly _d: Prisma.Decimal;

  /** Rounding mode: round half away from zero (0.5 → 1, -0.5 → -1). */
  static readonly ROUND_HALF_UP = Prisma.Decimal.ROUND_HALF_UP;

  constructor(value: MoneyLike | Prisma.Decimal) {
    if (value instanceof Money) {
      this._d = value._d;
    } else if (value instanceof Prisma.Decimal) {
      this._d = value;
    } else {
      this._d = new Prisma.Decimal(String(value));
    }
  }

  // ── DecimalJsLike interface ───────────────────────────────────────────────
  // These three getters make Money structurally compatible with DecimalJsLike,
  // the interface Prisma accepts for Decimal field inputs.

  get d(): number[] { return (this._d as unknown as { d: number[] }).d; }
  get e(): number   { return (this._d as unknown as { e: number }).e; }
  get s(): number   { return (this._d as unknown as { s: number }).s; }

  // ── Arithmetic ────────────────────────────────────────────────────────────

  add(other: MoneyLike): Money { return new Money(this._d.add(this._coerce(other))); }
  sub(other: MoneyLike): Money { return new Money(this._d.sub(this._coerce(other))); }
  mul(other: MoneyLike): Money { return new Money(this._d.mul(this._coerce(other))); }
  div(other: MoneyLike): Money { return new Money(this._d.div(this._coerce(other))); }

  toDecimalPlaces(places: number, rounding: Prisma.Decimal.Rounding): Money;
  toDecimalPlaces(places?: number): Money;
  toDecimalPlaces(places?: number, rounding?: Prisma.Decimal.Rounding): Money {
    return rounding !== undefined
      ? new Money(this._d.toDecimalPlaces(places!, rounding))
      : new Money(this._d.toDecimalPlaces(places));
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  toFixed(places?: number): string { return this._d.toFixed(places); }
  toString(): string               { return this._d.toString(); }
  toNumber(): number               { return this._d.toNumber(); }
  valueOf(): string                { return this._d.toString(); }

  // ── Private ───────────────────────────────────────────────────────────────

  private _coerce(v: MoneyLike): Prisma.Decimal {
    return v instanceof Money ? v._d : new Prisma.Decimal(String(v));
  }
}
