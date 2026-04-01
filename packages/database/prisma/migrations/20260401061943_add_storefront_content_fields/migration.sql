-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "announcementCta" TEXT,
ADD COLUMN     "announcementText" TEXT,
ADD COLUMN     "announcementTitle" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "galleryImages" JSONB;
