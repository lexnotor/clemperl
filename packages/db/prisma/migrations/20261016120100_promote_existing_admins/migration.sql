-- Toute base qui portait un `ADMIN` est PROMUE.
--
-- Sans la promotion, une base existante se retrouverait avec un administrateur, aucun
-- super_admin, et une barrière d'amorçage qui compte les deux rôles : plus personne ne
-- pourrait nommer de super_admin, et `/setup` refuserait d'en créer un. Le but de la
-- plateforme serait manqué par une migration qui ne dit rien.
--
-- Les bases existantes n'en portent qu'un, celui de leur amorçage, qui est bien le
-- propriétaire de l'instance.
UPDATE "users" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';
