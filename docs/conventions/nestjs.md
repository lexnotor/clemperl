# NestJS

**Portée : `apps/api`.** Les applications Next ont leurs propres conventions de
structure, imposées par l'App Router.

## Structure d'un dossier module

Le fichier `.module.ts` est le **seul fichier autorisé à la racine** d'un dossier module.
Les sous-modules éventuels vont dans un sous-dossier `modules/` du module parent.

    src/
    └── modules/
        └── <nom-du-module>/
            ├── <nom-du-module>.module.ts
            ├── modules/
            ├── controllers/
            ├── resolvers/
            ├── services/
            ├── repositories/
            ├── guards/
            ├── middlewares/
            ├── exceptions/
            ├── entities/
            ├── dto/
            │   ├── request/
            │   └── response/
            ├── interfaces/
            ├── types/
            ├── enums/
            ├── constants/
            ├── utils/
            ├── adapters/
            └── processors/

Les trois derniers ne sont pas des cas particuliers : `utils/` porte les fonctions pures
du module, celles qu'un service appelle et qu'on veut tester sans NestJS ; `adapters/`
porte les implémentations d'un port du module, une par fournisseur ; `processors/` porte
les consommateurs de file. Un module qui n'en a pas besoin n'en crée pas.

`resolvers/` est au GraphQL ce que `controllers/` est au REST : l'entrée du module, qui
appelle ses services et ses dépôts, jamais l'inverse. Un résolveur vit dans le module métier
qu'il sert, à côté de son jumeau REST s'il en a un, et non dans le module `graphql`, qui ne
porte que la configuration du point d'entrée. Les types GraphQL sont des DTO de réponse,
dans `dto/response/`, nommés `<Nom>Dto` et publiés sous `<Nom>` par `@ObjectType("<Nom>")` :
`MeDto` devient le type `Me` du schéma.

`middlewares/` porte ce qui doit refuser une requête avant qu'un pilote ne la lise, ce
qu'un garde ne sait pas faire : un garde ne s'applique qu'au contrôleur ou au résolveur, une
fois la requête analysée. Le filtre d'origine de `/graphql` en est l'exemple.
Un middleware qui garde le point d'entrée d'un pilote couvre ses sous-chemins
(`forRoutes({ path: "graphql{/*rest}" })`) : Nest lie `forRoutes` à une route exacte, alors
qu'un pilote se monte souvent par préfixe. Voir `docs/pieges.md`.

## Barrels : un par sous-dossier, jamais à la racine du module

Chaque **sous-dossier** porte son `index.ts` (`constants/index.ts`, `enums/index.ts`,
`services/index.ts`…). C'est attendu, et les imports passent par là.

La **racine du module n'a pas d'`index.ts`**, et son absence est délibérée. Un barrel de
racine réexporte tout le module, donc deux modules qui se citent l'un l'autre forment un
cycle d'imports que NestJS et l'ORM résolvent en livrant `undefined` à l'exécution : pas
d'erreur au démarrage, une classe ou un provider vide au moment où on s'en sert. Le
symptôme est loin de la cause et coûte des heures.

Un module sans barrel de racine dont les fichiers utilisent des imports relatifs profonds
(`../constants/foo`) est dans son état voulu : ne pas « réparer » en en ajoutant un.
Une migration partielle (certains fichiers déjà sur les barrels de sous-dossier, d'autres
encore en imports profonds) est un état de transition accepté, pas un défaut à corriger
au passage.
