/**
 * @calon/database — ORM Boundary
 *
 * Workspace genelinde @prisma/client'a erişimin TEK noktası.
 * apps/api içindeki hiçbir dosya doğrudan '@prisma/client' import etmez —
 * tüm ORM yüzeyi buradan geçer.
 *
 * KURAL: PrismaClient bu dosyadan export EDİLMEZ.
 *   PrismaClient'ı yalnızca PrismaService (apps/api/src/common/prisma.service.ts)
 *   doğrudan '@prisma/client'dan import eder. Bu, ORM bağımlılığını tek noktada tutar.
 *
 * NOT — Prisma neden `export type` değil?
 *   Prisma namespace'i runtime değerleri içerir:
 *     - `new Prisma.Decimal()`      → runtime sınıf
 *     - `Prisma.PrismaClientKnownRequestError` → runtime sınıf (instanceof)
 *     - `Prisma.TransactionClient`  → type (erased), ama namespace runtime'da gerekli
 *   `export type { Prisma }` derleyici tarafından silinir → runtime'da
 *   "Prisma is not defined" hatası fırlar. Bu nedenle runtime export zorunludur.
 *
 * HEDEF: Servis katmanı bu modülü kullanarak Prisma.* referanslarından
 *   izole edilir. Aşağıdaki abstraction katmanları bu izolasyonu sağlar:
 *     - Money        → Prisma.Decimal yerine
 *     - DbTransaction → Prisma.TransactionClient yerine
 *     - JsonValue    → Prisma.InputJsonValue yerine
 *     - is*Error()   → Prisma.PrismaClientKnownRequestError yerine
 */

// ── ORM Namespace (runtime) ────────────────────────────────────────────────
// Prisma WhereInput, OrderByInput, vb. query-builder tipleri için hâlâ gerekli.
// Decimal, PrismaClientKnownRequestError artık doğrudan kullanılmıyor —
// bunların yerini Money ve is*Error() fonksiyonları aldı.
export { Prisma } from '@prisma/client';

// ── Enums (runtime değerler — DTO, guard, service katmanlarında kullanılır) ─
export {
  AppointmentSource,
  AppointmentStatus,
  BillingCycle,
  BillingStatus,
  DayOfWeek,
  DeliveryStatus,
  NotificationChannel,
  OutboxEventStatus,
  PaymentStatus,
  PhotoType,
  PreferenceScope,
  TenantPlan,
  TenantStatus,
  TransactionType,
  UsageEventType,
} from '@prisma/client';

// ── Model Tipleri (compile-time only — runtime'da silinir) ─────────────────
export type {
  Appointment,
  CommissionLog,
  ConsentForm,
  Customer,
  CustomerPhoto,
  LoyaltyTransaction,
  Product,
  Service,
  StaffProfile,
  StaffShift,
  StaffWorkingHour,
  TransactionLedger,
} from '@prisma/client';

// ── ORM Abstraction Layer ──────────────────────────────────────────────────

// Money — decimal precision arithmetic (replaces new Prisma.Decimal())
export { Money }           from './money';
export type { MoneyLike }  from './money';

// DbTransaction — transaction client type (replaces Prisma.TransactionClient)
export type { DbTransaction } from './transaction';

// JsonValue — JSON field input type (replaces Prisma.InputJsonValue)
export type { JsonValue } from './types';

// Error predicates — ORM error detection (replaces instanceof Prisma.PrismaClientKnownRequestError)
export {
  isDeadlockError,
  isForeignKeyError,
  isGistExclusionViolation,
  isRecordNotFoundError,
  isUniqueConstraintError,
  // Error mapper — use in repository catch blocks
  mapToDomainError,
} from './errors';

// Domain Error Classes — typed database errors for service layer
export {
  DatabaseError,
  UniqueConstraintError,
  ForeignKeyError,
  RecordNotFoundError,
  GistExclusionError,
  DeadlockError,
} from './domain-errors';
