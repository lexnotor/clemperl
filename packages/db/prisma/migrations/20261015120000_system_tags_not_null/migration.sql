-- `system_tags` est né sans NOT NULL, contrairement à `vendors.payment_methods`, qui est le
-- même construit. Prisma ne signale aucune dérive : il ne compare pas la nullabilité d'une
-- liste scalaire, et le défaut suffit à ce que son client n'écrive jamais NULL.
--
-- Le trou est ailleurs. Un INSERT brut, une restauration ou une amorce qui écrit NULL
-- explicitement produit `system_tags IS NULL`, et PostgreSQL évalue alors
-- `NOT ('REVIEWED' = ANY(NULL))` à NULL : le produit quitte la file de modération sans
-- erreur et sans que rien ne le dise.
--
-- Une migration SÉPARÉE, et non une correction de la première : celle-ci est appliquée, et
-- son sha256 est enregistré dans `_prisma_migrations`.
UPDATE "products" SET "system_tags" = ARRAY[]::"product_tag"[] WHERE "system_tags" IS NULL;

ALTER TABLE "products" ALTER COLUMN "system_tags" SET NOT NULL;
