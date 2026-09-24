-- CreateEnum
CREATE TYPE "SaleProofStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "SuccessfulDeal" ADD COLUMN     "proofNote" TEXT,
ADD COLUMN     "proofReviewNote" TEXT,
ADD COLUMN     "proofReviewedAt" TIMESTAMP(3),
ADD COLUMN     "proofStatus" "SaleProofStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- CreateTable
CREATE TABLE "SaleProof" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleProof_dealId_idx" ON "SaleProof"("dealId");

-- CreateIndex
CREATE INDEX "SuccessfulDeal_proofStatus_idx" ON "SuccessfulDeal"("proofStatus");

-- AddForeignKey
ALTER TABLE "SaleProof" ADD CONSTRAINT "SaleProof_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "SuccessfulDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProof" ADD CONSTRAINT "SaleProof_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

