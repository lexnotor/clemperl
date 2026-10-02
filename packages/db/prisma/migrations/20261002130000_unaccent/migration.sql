-- La recherche du catalogue compare des titres sans tenir compte des accents : « etole »
-- doit trouver « Étole ». `unaccent` est une extension livrée avec PostgreSQL, et non une
-- dépendance supplémentaire.
CREATE EXTENSION IF NOT EXISTS unaccent;
