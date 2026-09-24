# ClemPerl

Marketplace multi-vendeurs de fournitures diverses — habillement, joaillerie,
maroquinerie. Monorepo Turborepo : Next.js, NestJS, Prisma, PostgreSQL, Redis,
Supabase Storage (médias uniquement).

Interface en français par défaut, anglais en seconde langue.

**Le code s'écrit en anglais** : identifiants, noms de fichiers, segments d'URL, clés de
traduction. **La documentation et les commentaires de code s'écrivent en français**, de
même que les libellés vus par l'utilisateur, qui vivent dans les catalogues de
traduction. Les messages de commit, les descriptions de PR, les noms de branches et le
`README.md` sont en anglais.

Autrement dit : ce qu'une machine lit est en anglais, ce qu'un humain lit est en
français — sauf dans Git, où la langue de travail commune l'emporte.

Ce fichier est **ce qui est vrai dans ce dépôt**. Il va par paire avec
`docs/conventions/`, qui est **comment le travail doit être fait**. Là où ils se
recouvrent, ce fichier gagne sur les faits propres au dépôt, et
`docs/conventions/` gagne sur les standards et la conduite.

## Lire le bon document en premier

Charger le document concerné **avant la première édition**, pas après le premier
commentaire de revue.

| Le travail touche…                                                   | Lire…                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Toucher à l'historique : commiter, brancher, ouvrir ou mettre à jour une PR | [Git](docs/conventions/git.md)                                            |
| Affirmer qu'un changement fonctionne, avant de le rendre             | [Vérification](docs/conventions/verification.md)                               |
| Écrire un test, ou s'en passer ; ajuster un seuil de couverture       | [Tests](docs/conventions/tests.md)                                             |
| Nommer un fichier, un type, un enum ; écrire ou relire un commentaire | [Code](docs/conventions/code.md)                                               |
| Créer ou réorganiser un module de l'API NestJS                        | [NestJS](docs/conventions/nestjs.md)                                           |
| Écrire un composant, organiser une feature d'un front                | [Next et React](docs/conventions/next.md)                                      |
| Ajouter un package, construire une image, toucher au workspace       | [Monorepo et Docker](docs/conventions/monorepo.md)                             |
| Lever une erreur, ou formater ce que le client reçoit                | [Erreurs localisées](docs/conventions/erreurs.md)                              |
| Lire la locale, l'utilisateur ou l'identifiant de requête loin du point d'entrée | [Contexte de requête](docs/conventions/contexte-requete.md)          |
| Expliquer un mécanisme, ici ou dans un document                      | [Explanations](docs/conventions/explanations.md)                               |
| Décider combien vérifier avant de livrer                             | [Ce qui casse si on se trompe](docs/ce-qui-casse.md)                           |
| Du code qui paraît bizarre et qu'on s'apprête à « corriger », ou un symptôme qu'on ne s'explique pas | [Pièges déjà payés](docs/pieges.md)             |
| Monter le monorepo, un Dockerfile, le compose, Prisma, l'i18n, la CI  | [Design T0](docs/superpowers/specs/2026-09-17-t0-fondations-monorepo-design.md) |
| S'inscrire, se connecter, partager une session entre les fronts       | [Design T1a](docs/superpowers/specs/2026-09-18-t1a-identite-design.md)          |
| Modéliser un produit, ses axes, ses variantes ou un prix              | [Design T2b](docs/superpowers/specs/2026-09-21-t2b-produit-variantes-design.md) |
| Déposer une image, toucher à la file ou au worker                     | [Design T2c](docs/superpowers/specs/2026-09-24-t2c-pipeline-medias-design.md)   |
| Reprendre le travail sur une autre machine, ou après une interruption | [Passation](docs/passation.md)                                                  |

Un travail qui traverse plusieurs disciplines est tenu aux deux standards à la
fois. Un changement de script de déploiement qui modifie aussi le contrat de
composition est un changement d'infrastructure **et** un changement de release.

Pour les documents longs : lire la section dont on a besoin, pas le fichier.

**Chaque document déclare sa portée en tête** — tout le dépôt, `apps/api`, les fronts
Next, ou un package. Une règle écrite pour le backend ne s'applique pas au frontend du
seul fait qu'elle est dans `docs/conventions/`.
