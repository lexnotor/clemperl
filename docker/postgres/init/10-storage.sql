-- Base dédiée à `supabase/storage-api`, qui joue ses propres migrations et y installe
-- ses rôles : lui donner la nôtre poserait ses tables à côté de celles de Prisma.
--
-- Le rôle `postgres` existe pour lui seul : sa migration `storage-schema` le référence
-- en dur, alors que le superutilisateur de cette instance s'appelle `clemperl`. Sans ce
-- rôle, le conteneur ne démarre jamais.
CREATE ROLE postgres SUPERUSER LOGIN PASSWORD 'postgres';
CREATE DATABASE storage OWNER postgres;
