# Docker

Tout ce qui concerne la conteneurisation de ClemPerl vit ici : un dossier par service
que nous construisons nous-mêmes, et un fichier de composition par environnement.

## Organisation

| Chemin | Rôle |
| --- | --- |
| `docker-compose.dev.yml` | environnement de développement complet |
| `postgres/` | image de la base, sa locale et sa configuration |
| `redis/` | image de Redis, politique mémoire adaptée à BullMQ |
| `proxy/` | nginx : terminaison TLS et routage par nom d'hôte |

Les images des quatre applications ne sont pas ici : leur `Dockerfile` vit à côté du code
qu'il construit, dans `apps/<application>/`. C'est le seul endroit où une modification du
code et une modification de son image se lisent dans le même diff.

**Aucune image n'est déclarée directement dans un fichier de composition.** Même Postgres
et Redis passent par un `Dockerfile` : c'est le seul endroit où accrocher une
configuration, un script d'initialisation ou une extension, et l'ajouter après coup
demanderait de déplacer un service en production.

## Commandes

Elles se lancent depuis la **racine du dépôt**, jamais depuis ce dossier — le contexte de
build est la racine, et le fichier d'environnement s'y trouve aussi.

    pnpm docker:up      # construit et démarre la stack
    pnpm docker:ps      # état et santé des services
    pnpm docker:logs    # journaux, en continu
    pnpm docker:down    # arrête la stack

Avant le premier démarrage :

    cp .env.example .env    # renseigner DEV_HOST avec l'adresse locale de la machine
    pnpm dev:certs          # certificat TLS pour DEV_HOST et ses sous-domaines

## Points d'entrée

Seul le port 443 est publié. Les quatre applications sont servies par nginx sur des
sous-domaines dérivés de `DEV_HOST` :

| Application | Nom |
| --- | --- |
| storefront | `https://${DEV_HOST}` |
| vendor | `https://vendeur.${DEV_HOST}` |
| admin | `https://admin.${DEV_HOST}` |
| api | `https://api.${DEV_HOST}` |

`DEV_HOST` utilise sslip.io, qui résout tout nom contenant une adresse IP vers cette
adresse : la stack est donc joignable depuis n'importe quel appareil du réseau local,
sans configuration DNS. Après un changement d'adresse, relancer `pnpm dev:certs` — le
certificat est émis pour un nom précis.

## Après l'ajout d'une dépendance

    pnpm docker:down && docker volume rm clemperl_dev_pg_data   # si besoin
    pnpm docker:up

Un volume monté n'est peuplé qu'à sa création : `--build` seul ne suffit pas quand
l'arborescence des dépendances a changé.
