/**
 * JsonValue — Alias for Prisma's JSON field input type.
 *
 * Use this type instead of `Prisma.InputJsonValue` when casting values
 * for storage into Prisma model fields typed as `Json`.
 * This alias isolates the Prisma dependency inside the @calon/database package.
 */

import { Prisma } from '@prisma/client';

export type JsonValue = Prisma.InputJsonValue;
