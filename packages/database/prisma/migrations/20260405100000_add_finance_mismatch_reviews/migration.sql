-- CreateTable
CREATE TABLE "finance_mismatch_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "mismatchClass" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "owner" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decisionReason" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "manualRepairNeeded" BOOLEAN NOT NULL DEFAULT false,
    "repairNote" TEXT,
    "repairPerformedBy" TEXT,
    "repairPerformedAt" TIMESTAMP(3),
    "repairVerifiedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "escalatedTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_mismatch_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_mismatch_reviews_tenantId_status_idx" ON "finance_mismatch_reviews"("tenantId", "status");
CREATE INDEX "finance_mismatch_reviews_tenantId_mismatchClass_idx" ON "finance_mismatch_reviews"("tenantId", "mismatchClass");
CREATE INDEX "finance_mismatch_reviews_tenantId_priority_idx" ON "finance_mismatch_reviews"("tenantId", "priority");
CREATE INDEX "finance_mismatch_reviews_tenantId_nextReviewDate_idx" ON "finance_mismatch_reviews"("tenantId", "nextReviewDate");

-- AddForeignKey
ALTER TABLE "finance_mismatch_reviews" ADD CONSTRAINT "finance_mismatch_reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
