-- Atoll and island are optional on listings
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_atollId_fkey";
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_islandId_fkey";
ALTER TABLE "Listing" ALTER COLUMN "atollId" DROP NOT NULL;
ALTER TABLE "Listing" ALTER COLUMN "islandId" DROP NOT NULL;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_atollId_fkey" FOREIGN KEY ("atollId") REFERENCES "Atoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_islandId_fkey" FOREIGN KEY ("islandId") REFERENCES "Island"("id") ON DELETE SET NULL ON UPDATE CASCADE;
