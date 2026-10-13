-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspended_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_suspended_by_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
