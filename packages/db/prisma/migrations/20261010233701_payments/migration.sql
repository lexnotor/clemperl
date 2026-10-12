CREATE TYPE "payment_method" AS ENUM ('CARD', 'MOBILE_MONEY', 'CASH_ON_DELIVERY', 'BANK_TRANSFER', 'OFF_PLATFORM');
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

ALTER TABLE "vendors" ADD COLUMN "payment_methods" "payment_method"[] NOT NULL DEFAULT ARRAY[]::"payment_method"[];

-- Les boutiques existantes gardent leur place au catalogue. Le catalogue n'admet qu'une
-- boutique acceptant au moins une méthode : sans cette ligne, elles en sortiraient TOUTES
-- le jour du déploiement.
UPDATE "vendors" SET "payment_methods" = ARRAY['OFF_PLATFORM']::"payment_method"[];

ALTER TABLE "orders" ADD COLUMN "payment_method" "payment_method" NOT NULL DEFAULT 'OFF_PLATFORM';
ALTER TABLE "orders" ADD COLUMN "payment_status" "payment_status" NOT NULL DEFAULT 'PENDING';

-- Une commande déjà expédiée qui afficherait « paiement en attente » serait une affirmation
-- fausse sur de l'argent, et c'est le genre d'affirmation qu'on ne rattrape pas.
UPDATE "orders" SET "payment_status" = 'SETTLED' WHERE "status" = 'SHIPPED';

-- Le défaut ne sert qu'à la reprise des lignes existantes. Le garder laisserait une
-- commande naître sans méthode choisie, ce que la validation refuse à l'entrée.
ALTER TABLE "orders" ALTER COLUMN "payment_method" DROP DEFAULT;

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" "currency" NOT NULL,
    "provider" TEXT,
    "provider_ref" TEXT,
    "raw_payload" BYTEA,
    "settled_by_id" TEXT,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");
CREATE INDEX "payments_order_id_created_at_idx" ON "payments"("order_id", "created_at");
CREATE INDEX "orders_vendor_id_payment_status_idx" ON "orders"("vendor_id", "payment_status");

ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_settled_by_id_fkey" FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
