
-- CreateEnum
CREATE TYPE "product_tag" AS ENUM ('REVIEWED');

-- CreateEnum
CREATE TYPE "moderation_reason" AS ENUM ('COUNTERFEIT', 'PROHIBITED_ITEM', 'MISLEADING_CONTENT', 'INAPPROPRIATE_IMAGE', 'OTHER');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "system_tags" "product_tag"[] DEFAULT ARRAY[]::"product_tag"[];

