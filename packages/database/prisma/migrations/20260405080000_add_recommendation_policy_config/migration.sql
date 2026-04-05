-- CreateTable
CREATE TABLE "recommendation_policy_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "lowConfidenceMinVisits" INTEGER NOT NULL DEFAULT 4,
    "monitorProportionCap" DOUBLE PRECISION NOT NULL DEFAULT 0.60,
    "reviewProportionCap" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "observationWindowDays" INTEGER NOT NULL DEFAULT 14,
    "noiseSuppressExpiredRate" DOUBLE PRECISION NOT NULL DEFAULT 0.80,
    "criticalRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.8,
    "criticalOverdueDays" INTEGER NOT NULL DEFAULT 14,
    "overdueRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.3,
    "overdueOverdueDays" INTEGER NOT NULL DEFAULT 7,
    "dormantDays" INTEGER NOT NULL DEFAULT 90,
    "confidenceVarianceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "strongRelationshipMinVisits" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_policy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_policy_configs_tenantId_key" ON "recommendation_policy_configs"("tenantId");

-- AddForeignKey
ALTER TABLE "recommendation_policy_configs" ADD CONSTRAINT "recommendation_policy_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
