/**
 * ORM Error Helpers — @calon/database
 *
 * Named predicates that wrap Prisma-specific error detection.
 * Service layer code calls these instead of referencing `Prisma.*` directly,
 * keeping the ORM boundary inside the @calon/database package.
 */

import { Prisma } from '@prisma/client';

// ── Constraint violations ─────────────────────────────────────────────────────

/** P2002 — Unique constraint violation (duplicate key, idempotency race). */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** P2003 — Foreign key constraint violation. */
export function isForeignKeyError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

/** P2025 — Record not found (update/delete on non-existent row). */
export function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

// ── PostgreSQL-specific ───────────────────────────────────────────────────────

/**
 * P2010 + PostgreSQL 23P01 — GIST exclusion constraint violation.
 * Used for appointment time-range overlap detection.
 * Prisma surfaces raw-query GIST failures as P2010 with meta.code = '23P01'.
 */
export function isGistExclusionViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
    const meta = err.meta as { code?: string; message?: string } | undefined;
    if (meta?.code === '23P01')              return true;
    if (meta?.message?.includes('23P01'))   return true;
  }
  if (err instanceof Error && err.message.includes('23P01')) return true;
  return false;
}

/**
 * PostgreSQL 40P01 — Deadlock detected.
 * May occur under high-concurrency GIST constraint races.
 */
export function isDeadlockError(err: unknown): boolean {
  if (err instanceof Error && err.message.includes('40P01'))              return true;
  if (err instanceof Error && err.message.toLowerCase().includes('deadlock')) return true;
  return false;
}

// ── Domain error mapper ───────────────────────────────────────────────────────

import {
  UniqueConstraintError,
  ForeignKeyError,
  RecordNotFoundError,
  GistExclusionError,
  DeadlockError,
} from './domain-errors';

/**
 * Maps a raw Prisma error to the appropriate typed domain error.
 * Call this in repository catch blocks to re-throw domain errors.
 *
 * @example
 *   try { await prisma.appointment.create(...) }
 *   catch (err) { throw mapToDomainError(err) }
 */
export function mapToDomainError(err: unknown): unknown {
  if (isUniqueConstraintError(err)) {
    const meta = (err as any).meta as { target?: string[] } | undefined;
    return new UniqueConstraintError(meta?.target?.join(', '), err);
  }
  if (isForeignKeyError(err)) {
    const meta = (err as any).meta as { field_name?: string } | undefined;
    return new ForeignKeyError(meta?.field_name, err);
  }
  if (isRecordNotFoundError(err)) {
    return new RecordNotFoundError(undefined, err);
  }
  if (isGistExclusionViolation(err)) {
    return new GistExclusionError(err);
  }
  if (isDeadlockError(err)) {
    return new DeadlockError(err);
  }
  return err;
}
