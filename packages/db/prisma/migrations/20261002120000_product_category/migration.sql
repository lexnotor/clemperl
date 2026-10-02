-- CreateEnum
CREATE TYPE "product_category" AS ENUM ('APPAREL', 'JEWELLERY', 'LEATHER_GOODS');
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "category" "product_category" NOT NULL DEFAULT 'APPAREL';
-- CreateIndex
CREATE INDEX "products_status_category_idx" ON "products"("status", "category");
