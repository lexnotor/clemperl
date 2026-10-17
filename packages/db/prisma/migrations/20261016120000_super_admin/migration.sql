-- `SUPER_ADMIN` rejoint l'énumération. La promotion des administrateurs existants vit dans
-- la migration suivante : PostgreSQL refuse d'utiliser une valeur d'énumération ajoutée dans
-- la même transaction que son `ALTER TYPE`.
ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN';
