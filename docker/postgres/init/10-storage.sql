-- `storage-api` joue ses propres migrations et s'attend à POSSÉDER sa base : il y crée
-- son schéma, ses rôles et ses tables. Lui donner la nôtre l'amènerait à poser des
-- objets à côté de ceux de Prisma, dans un schéma qu'aucune migration du dépôt ne
-- décrit — et que `prisma migrate diff` chercherait ensuite à supprimer.
--
-- Le rôle `postgres` est créé alors que le superutilisateur de cette instance s'appelle
-- `clemperl` : la migration `storage-schema` de storage-api le référence EN DUR, et
-- `DB_SUPER_USER` ne couvre pas ce cas. Sans ce rôle, le conteneur boucle au démarrage
-- sur « role "postgres" does not exist ». Constaté le 2026-09-19 avec l'image v1.79.4.
CREATE ROLE postgres SUPERUSER LOGIN PASSWORD 'postgres';
CREATE DATABASE storage OWNER postgres;
