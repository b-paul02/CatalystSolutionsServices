-- Applied to production 2026-09-28, one transaction. Additive: CosAccessRequest (uninvited sign-up requests).
BEGIN;

-- CreateTable
CREATE TABLE "CosAccessRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "CosAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CosAccessRequest_email_key" ON "CosAccessRequest"("email");

-- CreateIndex
CREATE INDEX "CosAccessRequest_status_createdAt_idx" ON "CosAccessRequest"("status", "createdAt");


COMMIT;
