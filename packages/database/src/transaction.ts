/**
 * DbTransaction — ORM transaction client type alias.
 *
 * Use this type instead of `Prisma.TransactionClient` in service/repository code.
 * DbTransaction instances are created only by `prisma.$transaction()` in PrismaService.
 * This type alias isolates the Prisma dependency inside the @calon/database package.
 */

import { Prisma } from '@prisma/client';

export type DbTransaction = Prisma.TransactionClient;
