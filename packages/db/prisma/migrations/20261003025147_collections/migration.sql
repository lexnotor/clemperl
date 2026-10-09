-- `collections` devient un segment de route sous une boutique. Next résout un segment
-- statique AVANT un segment dynamique, donc un produit portant déjà ce slug verrait sa
-- page masquée par la route homonyme et répondrait 404, sans message.
--
-- Échouer ici est préférable : une migration qui casse une URL en silence se découvre en
-- production, par un vendeur qui ne retrouve plus son article.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM products WHERE slug = 'collections') THEN
        RAISE EXCEPTION 'un produit porte le slug « collections », qui devient réservé. Le renommer avant de rejouer cette migration.';
    END IF;
END $$;

-- CreateEnum
CREATE TYPE "collection_status" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "collection_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collections_vendor_id_status_idx" ON "collections"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "collections_vendor_id_slug_key" ON "collections"("vendor_id", "slug");

-- CreateIndex
CREATE INDEX "collection_items_product_id_idx" ON "collection_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_product_id_key" ON "collection_items"("collection_id", "product_id");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
