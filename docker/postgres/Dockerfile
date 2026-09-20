# Base de données de ClemPerl. Elle a son propre Dockerfile plutôt qu'une image déclarée
# dans le compose : c'est le seul endroit où accrocher une configuration, un script
# d'initialisation ou une extension, et le faire dès maintenant évite d'avoir à déplacer
# un service en production pour y ajouter une ligne.
FROM postgres:17-alpine

# Le tri et la comparaison de chaînes dépendent de la locale : sans elle, PostgreSQL
# classe « Émile » après « Zoé ». Elle est fixée ici pour que le développement, les
# tests et la production ordonnent les résultats de la même façon.
ENV LANG=fr_FR.UTF-8
ENV POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C"

# Les scripts d'initialisation ne sont joués qu'à la création du volume, jamais sur une
# base déjà peuplée : changer ce dossier impose un `down -v` pour qu'il prenne effet.
COPY docker/postgres/init/ /docker-entrypoint-initdb.d/

EXPOSE 5432
