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
            ├── services/
            ├── repositories/
            ├── guards/
            ├── exceptions/
            ├── entities/
            ├── dto/
            │   ├── request/
            │   └── response/
            ├── interfaces/
            ├── types/
            ├── enums/
            └── constants/

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
Une migration partielle — certains fichiers déjà sur les barrels de sous-dossier, d'autres
encore en imports profonds — est un état de transition accepté, pas un défaut à corriger
au passage.
