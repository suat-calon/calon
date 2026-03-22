/**
 * Domain Error Classes — @calon/database
 *
 * Typed database errors thrown by repositories and caught by service layer.
 * Services catch UniqueConstraintError, NotFoundError etc. without any
 * knowledge of Prisma error codes (P2002, P2025, etc.).
 */

/** Base class for all database-originated errors. */
export class DatabaseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** P2002 — Unique constraint violation (duplicate key, idempotency race). */
export class UniqueConstraintError extends DatabaseError {
  constructor(public readonly field?: string, cause?: unknown) {
    super(field ? `Benzersizlik ihlali: ${field}` : 'Benzersizlik ihlali', cause);
    this.name = 'UniqueConstraintError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** P2003 — Foreign key constraint violation. */
export class ForeignKeyError extends DatabaseError {
  constructor(public readonly field?: string, cause?: unknown) {
    super(field ? `Yabancı anahtar ihlali: ${field}` : 'Yabancı anahtar ihlali', cause);
    this.name = 'ForeignKeyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** P2025 — Record not found for update/delete operation. */
export class RecordNotFoundError extends DatabaseError {
  constructor(public readonly entity?: string, cause?: unknown) {
    super(entity ? `Kayıt bulunamadı: ${entity}` : 'Kayıt bulunamadı', cause);
    this.name = 'RecordNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** P2010 + 23P01 — GIST exclusion constraint (time-range overlap). */
export class GistExclusionError extends DatabaseError {
  constructor(cause?: unknown) {
    super('Zaman aralığı çakışması (GIST exclusion ihlali)', cause);
    this.name = 'GistExclusionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 40P01 — PostgreSQL deadlock detected. */
export class DeadlockError extends DatabaseError {
  constructor(cause?: unknown) {
    super('Eşzamanlı işlem kilitlendi (deadlock)', cause);
    this.name = 'DeadlockError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
