-- Faz 21: Self-Onboarding Wizard — isTestBooking flag for appointments
ALTER TABLE "appointments" ADD COLUMN "isTestBooking" BOOLEAN NOT NULL DEFAULT false;
