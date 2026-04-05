-- CreateTable
CREATE TABLE "policy_patches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "patchType" TEXT NOT NULL,
    "sourceCandidateType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "safetyClass" TEXT NOT NULL,
    "affectedArea" TEXT NOT NULL,
    "proposedChange" JSONB NOT NULL,
    "previousState" JSONB,
    "evidenceSummary" TEXT NOT NULL,
    "constitutionVerdict" TEXT NOT NULL,
    "constitutionDetails" JSONB NOT NULL,
    "rollbackStrategy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_patches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_patches_tenantId_status_idx" ON "policy_patches"("tenantId", "status");

-- CreateIndex
CREATE INDEX "policy_patches_tenantId_patchType_idx" ON "policy_patches"("tenantId", "patchType");

-- AddForeignKey
ALTER TABLE "policy_patches" ADD CONSTRAINT "policy_patches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
