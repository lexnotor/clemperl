# Monorepo et builds Docker

**Portée : tout le dépôt.**

## Organisation du workspace

- **Tout est dans le workspace** : `apps/storefront`, `apps/vendor`, `apps/admin`,
  `apps/api` et `packages/*`, déclarés dans `pnpm-workspace.yaml`. **Un seul lockfile**,
  `pnpm-lock.yaml`, à la racine. On installe **à la racine**
  (`pnpm install --frozen-lockfile`), et on lance soit depuis l'app
  (`cd apps/storefront && pnpm dev`), soit depuis la racine
  (`pnpm --filter @clemperl/storefront build`).
- **Aucune application n'est autonome.** Les quatre partagent `@clemperl/db`,
  `@clemperl/core` et `@clemperl/domain` ; les sortir du workspace obligerait à publier
  ces packages sur un registre ou à les copier.
- **pnpm** comme gestionnaire de paquets, activé par `corepack`, jamais installé
  globalement.
- **Node.js >= 24.**

pnpm ne hoiste pas comme npm : chaque package a son `node_modules` de liens vers un store
commun. L'objectif est le même — une installation, un lockfile, aucune duplication sur
disque — mais l'arborescence diffère, et un outil qui suppose un `node_modules` unique et
plat se trompera.

## Builds Docker depuis la racine

> **Les images se construisent depuis la RACINE du dépôt**
> (`context: .`, `dockerfile: apps/<app>/Dockerfile`) : le workspace a besoin du lockfile
> unique et de `packages/`.

**Un `.dockerignore` à la racine est obligatoire**, et c'est le seul que Docker lira pour
ces builds : ceux des apps ne s'appliquent plus. Sans lui, le contexte transféré embarque
tout le dépôt — les `node_modules`, `.git`, et les applications qui n'ont rien à voir avec
l'image. Mesurer avant d'écrire le fichier, et noter le chiffre ici.

*Mesuré le 2026-09-17, dépôt à l'état « squelette du workspace » (dépendances racine
installées, aucune application créée) : **83 Mo** sans `.dockerignore`, **21 Ko** avec,
soit 99 % de réduction. Le rapport ne peut que croître une fois les quatre applications
et leurs dépendances en place — à remesurer à la fin de T0.*

**Les manifestes se copient avant les sources**, l'installation entre les deux : c'est ce
qui garde le cache de la couche d'installation. Ici, `turbo prune --docker` produit cette
séparation lui-même — `out/json/` ne contient que les manifestes du sous-graphe,
`out/full/` les sources. Il n'y a donc **aucune liste de `COPY` à tenir à jour** quand on
ajoute un package, et la dégradation silencieuse du cache que cette liste provoque
ailleurs ne peut pas se produire. C'est l'une des raisons du choix de `turbo prune`.

**Après l'ajout d'un package, le conteneur de développement doit repartir d'un volume
vide.** Un volume monté sur `node_modules` masque le contenu de l'image et n'est peuplé
qu'à sa création : `--build` seul ne suffira jamais.

Attention à la commande : `pnpm docker:up -V` (`--renew-anon-volumes`) ne renouvelle
que les volumes **anonymes**. Ce dépôt utilise des volumes **nommés** — pour que les
binaires natifs compilés dans l'image survivent au montage — donc `-V` est inopérant ici.
Il faut `pnpm docker:down --volumes`, ou supprimer le volume concerné. Hors développement, la
question ne se pose pas : les images de production n'ont aucun volume monté sur leurs
dépendances.
