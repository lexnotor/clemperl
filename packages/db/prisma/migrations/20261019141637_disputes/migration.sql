-- Les litiges : un acheteur conteste une commande expédiée, le vendeur répond,
-- l'administration tranche. Le litige vit à côté de la commande, qui garde son état.
--
-- NE PAS modifier ce fichier une fois appliqué, commentaires compris : sa somme sha256 est
-- enregistrée dans `_prisma_migrations`, et la changer fait diverger la somme.

-- CreateEnum
CREATE TYPE "dispute_reason" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'NOT_RECEIVED');

-- CreateEnum
CREATE TYPE "dispute_status" AS ENUM ('OPEN', 'DECIDED_FOR_BUYER', 'DECIDED_FOR_VENDOR', 'SERVED');

-- CreateEnum
CREATE TYPE "dispute_party" AS ENUM ('BUYER', 'VENDOR');

-- AlterTable
-- Aucun rattrapage : les commandes déjà expédiées gardent une date nulle et n'ouvrent donc
-- aucun litige. Reconstituer la date depuis `updated_at` serait faux, cette colonne bougeant
-- aussi avec le paiement, et la plateforme n'a aucune commande réelle à cette date.
ALTER TABLE "orders" ADD COLUMN     "shipped_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "reason" "dispute_reason" NOT NULL,
    "status" "dispute_status" NOT NULL DEFAULT 'OPEN',
    "locale" TEXT NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "decision_comment" TEXT,
    "decided_at" TIMESTAMP(3),
    "decided_by_id" TEXT,
    "served_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_items" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,

    CONSTRAINT "dispute_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "author_id" TEXT,
    "party" "dispute_party" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "object_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disputes_order_id_key" ON "disputes"("order_id");

-- CreateIndex
CREATE INDEX "disputes_status_last_activity_at_idx" ON "disputes"("status", "last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_items_dispute_id_order_item_id_key" ON "dispute_items"("dispute_id", "order_item_id");

-- CreateIndex
CREATE INDEX "dispute_messages_dispute_id_created_at_idx" ON "dispute_messages"("dispute_id", "created_at");

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_items" ADD CONSTRAINT "dispute_items_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_items" ADD CONSTRAINT "dispute_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_attachments" ADD CONSTRAINT "dispute_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "dispute_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
