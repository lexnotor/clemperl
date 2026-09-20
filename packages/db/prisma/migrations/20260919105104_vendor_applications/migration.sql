-- CreateEnum
CREATE TYPE "vendor_application_status" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "vendor_decision" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "vendor_rejection_reason" AS ENUM ('INCOMPLETE_FILE', 'UNREADABLE_DOCUMENT', 'IDENTITY_MISMATCH', 'INELIGIBLE_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "vendor_document_kind" AS ENUM ('REGISTRY', 'IDENTITY', 'TAX');

-- CreateEnum
CREATE TYPE "vendor_member_role" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "vendor_category" AS ENUM ('APPAREL', 'JEWELLERY', 'LEATHER_GOODS');

-- CreateTable
CREATE TABLE "vendor_applications" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "status" "vendor_application_status" NOT NULL DEFAULT 'SUBMITTED',
    "locale" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "shop_description" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "categories" "vendor_category"[],
    "legal_form" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "tax_number" TEXT,
    "country" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "vendor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "kind" "vendor_document_kind" NOT NULL,
    "object_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_decisions" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "decision" "vendor_decision" NOT NULL,
    "reason" "vendor_rejection_reason",
    "comment" TEXT,
    "decided_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "shop_description" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "categories" "vendor_category"[],
    "legal_form" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "tax_number" TEXT,
    "country" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_members" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "vendor_member_role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_vendor_id_key" ON "vendor_applications"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_applications_applicant_id_idx" ON "vendor_applications"("applicant_id");

-- CreateIndex
CREATE INDEX "vendor_applications_status_submitted_at_idx" ON "vendor_applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_documents_application_id_kind_key" ON "vendor_documents"("application_id", "kind");

-- CreateIndex
CREATE INDEX "vendor_decisions_application_id_created_at_idx" ON "vendor_decisions"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "vendor_members_user_id_idx" ON "vendor_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_members_vendor_id_user_id_key" ON "vendor_members"("vendor_id", "user_id");

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_decisions" ADD CONSTRAINT "vendor_decisions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_decisions" ADD CONSTRAINT "vendor_decisions_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un seul dossier ouvert par candidat. Prisma ne sait pas déclarer un index unique
-- partiel : cette contrainte s'écrit donc à la main, et c'est la base qui l'arbitre —
-- une vérification applicative perdrait la course entre deux onglets.
CREATE UNIQUE INDEX "vendor_applications_applicant_open_key"
    ON "vendor_applications" ("applicant_id")
    WHERE "status" = 'SUBMITTED'::"vendor_application_status";
