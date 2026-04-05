-- AlterTable: Add operational review fields to policy_patches
ALTER TABLE "policy_patches" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "policy_patches" ADD COLUMN "watchUntil" TIMESTAMP(3);
ALTER TABLE "policy_patches" ADD COLUMN "nextReviewDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "policy_patches_tenantId_reviewStatus_idx" ON "policy_patches"("tenantId", "reviewStatus");

-- CreateTable
CREATE TABLE "ops_review_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "reviewType" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" TEXT NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "confidenceOfRead" TEXT NOT NULL,
    "linkedPatchId" UUID,
    "linkedCandidateType" TEXT,
    "evidenceSummary" TEXT NOT NULL,
    "constitutionalNote" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "watchItems" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_review_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ops_review_records_tenantId_reviewType_idx" ON "ops_review_records"("tenantId", "reviewType");

-- CreateIndex
CREATE INDEX "ops_review_records_tenantId_decision_idx" ON "ops_review_records"("tenantId", "decision");

-- CreateIndex
CREATE INDEX "ops_review_records_tenantId_reviewedAt_idx" ON "ops_review_records"("tenantId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "ops_review_records" ADD CONSTRAINT "ops_review_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
