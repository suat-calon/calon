-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3);
