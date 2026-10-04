# T2e, les collections d'un vendeur : plan d'implémentation

> **Pour les exécutants agentiques :** utiliser `superpowers:subagent-driven-development`
> ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes
> emploient la syntaxe à cases (`- [ ]`).

**But :** un vendeur range des articles de son catalogue dans une collection transversale,
choisit leur ordre, et la publie sous un slug propre à sa boutique.

**Architecture :** une table `collections` et une table de liaison `collection_items`
portant une `position` non contrainte, réécrite en entier dans une transaction à chaque
mouvement. La page publique n'est pas une requête neuve : c'est un fragment de plus dans
le `conditions()` du catalogue.

**Pile :** Next 16 (App Router, server actions), Prisma 7, Zod 4, Tailwind 4, Vitest,
Jest et Testcontainers, Playwright.

**Spec :** `docs/superpowers/specs/2026-10-03-t2e-collections-design.md`

## Contraintes globales

Elles s'appliquent à **chaque** tâche, sans être répétées dans chacune.

- **Le code s'écrit en anglais** : identifiants, noms de fichiers, segments d'URL, clés de
  traduction. **Les commentaires et la documentation s'écrivent en français**, de même que
  les libellés vus par l'utilisateur, qui vivent dans les catalogues de traduction.
- **Pas de tiret quadratin en prose** (`docs/conventions/redaction.md`). Vérifier avant de
  commiter : `git diff --cached | grep -n "^+.*—"`. Seule exception, une citation ou une
  sortie de commande reproduite verbatim.
- **Un seul commit pour tout le chantier**, et **son message est court**. Chaque PR est
  désormais fusionnée en squash, qui empile les corps de tous les commits sous le titre.
  Ce qui mérite d'être conservé va dans la spec, dans `docs/pieges.md` ou dans la
  passation, pas dans un message de commit. Aucune tâche ci-dessous ne contient d'étape
  `git commit`, sauf la dernière.
- **La PR doit rester sous 100 fichiers**, au-delà CodeRabbit ne la relit pas. Compter
  avant d'ouvrir : `git diff --stat main...HEAD | tail -1`.
- **Avant toute commande qui démarre la stack Docker** (`pnpm docker:up`, `pnpm e2e:up`,
  `pnpm test:e2e`, les suites d'intégration), **demander aux autres sessions Claude si
  l'une d'elles teste** (`ListAgents`, puis `SendMessage`). Deux exécutions en parallèle
  font planter la machine de l'utilisateur.
- **La garde est appelée explicitement** en tête de chaque page et de chaque action
  serveur, jamais posée dans un layout.
- **Un fichier `"use server"` n'exporte QUE des fonctions asynchrones.** Toute constante
  partagée avec le client va dans un `types/*.interface.ts`.
- **Toute page lisant la session porte `export const dynamic = "force-dynamic";`**
- **Les dépôts ne reçoivent que des primitives**, jamais un type de `@clemperl/domain` :
  ce paquet dépend déjà de `@clemperl/db`, et l'inverse fermerait un cycle.
- **Les planchers de couverture sont à 100 %** pour `@clemperl/domain` et `@clemperl/ui`.
  Le cliquet monte, il ne descend jamais.
- **Branche de travail :** `feat/product-collections`, déjà sortie.

---

### Tâche 1 : Le mot réservé, et le déplacement d'un article

Deux fonctions pures, dans le seul paquet qui n'a besoin de rien pour être testé.

**Fichiers :**
- Modifier : `packages/domain/src/utils/product-slug.utils.ts`
- Créer : `packages/domain/src/utils/collection-order.utils.ts`
- Créer : `packages/domain/src/utils/collection-order.utils.spec.ts`
- Modifier : `packages/domain/src/utils/product-slug.utils.spec.ts`
- Modifier : `packages/domain/src/utils/index.ts`

**Interfaces produites :**
- `RESERVED_PRODUCT_SLUGS: readonly string[]`
- `slugifyProductTitle(title: string): string`, inchangée en signature
- `isReservedProductSlug(slug: string): boolean`
- `moveItem<T extends { id: string }>(items: readonly T[], id: string, direction: "up" | "down"): T[]`

- [ ] **Étape 1 : écrire les tests qui échouent**

`packages/domain/src/utils/collection-order.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { moveItem } from "./collection-order.utils.js";

const ITEMS = [{ id: "a" }, { id: "b" }, { id: "c" }];
const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe("moveItem", () => {
    it("remonte un article d'un rang", () => {
        expect(ids(moveItem(ITEMS, "b", "up"))).toEqual(["b", "a", "c"]);
    });

    it("descend un article d'un rang", () => {
        expect(ids(moveItem(ITEMS, "b", "down"))).toEqual(["a", "c", "b"]);
    });

    // Le bouton reste cliquable en tête de liste : répondre par la même liste vaut mieux
    // que lever, parce que l'appelant est une action serveur et qu'un clic sans effet
    // n'est pas une erreur.
    it("laisse la liste intacte aux extrémités", () => {
        expect(ids(moveItem(ITEMS, "a", "up"))).toEqual(["a", "b", "c"]);
        expect(ids(moveItem(ITEMS, "c", "down"))).toEqual(["a", "b", "c"]);
    });

    it("laisse la liste intacte pour un identifiant inconnu", () => {
        expect(ids(moveItem(ITEMS, "z", "up"))).toEqual(["a", "b", "c"]);
    });

    it("ne modifie pas la liste reçue", () => {
        const source = [...ITEMS];
        moveItem(source, "b", "up");
        expect(ids(source)).toEqual(["a", "b", "c"]);
    });
});
```

Ajouter à `packages/domain/src/utils/product-slug.utils.spec.ts` :

```ts
// `collections` est un segment de route sous une boutique. Next résout un segment
// statique avant un segment dynamique, donc un produit portant ce slug deviendrait
// inatteignable, sans message.
it("refuse un titre qui donnerait le slug réservé", () => {
    expect(isReservedProductSlug(slugifyProductTitle("Collections"))).toBe(true);
    expect(isReservedProductSlug(slugifyProductTitle("Sac cabas"))).toBe(false);
});
```

avec l'import complété : `import { isReservedProductSlug, slugifyProductTitle } from "./product-slug.utils.js";`

- [ ] **Étape 2 : lancer les tests et constater l'échec**

```
pnpm --filter @clemperl/domain test
```

Attendu : ÉCHEC, `Cannot find module './collection-order.utils.js'` et
`isReservedProductSlug is not a function`.

- [ ] **Étape 3 : écrire le déplacement**

`packages/domain/src/utils/collection-order.utils.ts` :

```ts
// L'ordre d'une collection est une donnée du vendeur, pas un tri. Cette fonction dit ce
// que devient la liste, et le dépôt se charge de réécrire les positions : séparer les
// deux permet de tester la règle sans base.
export function moveItem<T extends { id: string }>(
    items: readonly T[],
    id: string,
    direction: "up" | "down",
): T[] {
    const from = items.findIndex((item) => item.id === id);
    const to = direction === "up" ? from - 1 : from + 1;

    // Un identifiant inconnu, ou un mouvement hors des bornes, rend la liste telle quelle.
    // Le bouton reste cliquable en tête et en queue, et un clic sans effet n'est pas une
    // erreur à remonter à l'utilisateur.
    if (from === -1 || to < 0 || to >= items.length) {
        return [...items];
    }

    const moved = [...items];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item as T);
    return moved;
}
```

- [ ] **Étape 4 : réserver le mot**

`packages/domain/src/utils/product-slug.utils.ts`, en remplaçant le contenu :

```ts
import { slugify } from "./slug.utils.js";

// Les segments statiques qui vivent sous `/shops/<shop>/`. Next résout un segment statique
// AVANT un segment dynamique, donc un produit portant l'un de ces slugs serait masqué par
// la route homonyme, et sa page répondrait 404 sans que rien ne l'explique.
export const RESERVED_PRODUCT_SLUGS: readonly string[] = ["collections"];

export function isReservedProductSlug(slug: string): boolean {
    return RESERVED_PRODUCT_SLUGS.includes(slug);
}

export function slugifyProductTitle(title: string): string {
    return slugify(title);
}
```

- [ ] **Étape 5 : exporter**

`packages/domain/src/utils/index.ts`, ajouter dans l'ordre alphabétique :

```ts
export * from "./collection-order.utils.js";
```

- [ ] **Étape 6 : brancher le refus sur le formulaire produit**

`packages/domain/src/schemas/product.schema.ts`. Le champ `title` porte déjà une règle et
son motif ; la seconde se pose à côté, sur le même champ, puisque c'est le titre qui
produit le slug :

```ts
import { isReservedProductSlug, slugifyProductTitle } from "../utils/product-slug.utils.js";

    title: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/(?:[a-zA-Z0-9].*){2}/u, "doit contenir au moins deux caractères latins")
        // Le refus se formule sur le TITRE, qui est ce que le vendeur a sous les yeux. Lui
        // parler du slug lui demanderait de deviner comment son titre se transforme.
        .refine(
            (title) => !isReservedProductSlug(slugifyProductTitle(title)),
            "ce titre est réservé, choisissez-en un autre",
        ),
```

Le message suit le style des voisins : il dit ce qui ne va pas et ce qu'il faut faire, sans
exposer la mécanique interne.

- [ ] **Étape 7 : vérifier**

```
pnpm --filter @clemperl/domain test
pnpm --filter @clemperl/domain typecheck
```

Attendu : tous les tests passent, couverture à 100 %.

---

### Tâche 2 : Le schéma et sa migration

**Fichiers :**
- Modifier : `packages/db/prisma/schema.prisma`
- Créer : `packages/db/prisma/migrations/<horodatage>_collections/migration.sql`

**Interfaces produites :** les modèles `Collection` et `CollectionItem`, l'énumération
`E_COLLECTION_STATUS`.

- [ ] **Étape 1 : écrire le schéma**

Ajouter à `packages/db/prisma/schema.prisma`, après les modèles produit :

```prisma
enum E_COLLECTION_STATUS {
  DRAFT
  PUBLISHED

  @@map("collection_status")
}

model Collection {
  id          String              @id @default(cuid(2))
  vendorId    String              @map("vendor_id")
  slug        String
  title       String
  description String?
  status      E_COLLECTION_STATUS @default(DRAFT)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  publishedAt DateTime? @map("published_at")

  vendor Vendor           @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  items  CollectionItem[]

  // Même règle que le produit : le slug est unique par BOUTIQUE, pas globalement. Deux
  // vendeurs ont le droit d'avoir chacun leur « soldes-ete ».
  @@unique([vendorId, slug])
  @@index([vendorId, status])
  @@map("collections")
}

model CollectionItem {
  id           String @id @default(cuid(2))
  collectionId String @map("collection_id")
  productId    String @map("product_id")

  // PAS d'unicité sur (collectionId, position). PostgreSQL vérifie une contrainte à chaque
  // INSTRUCTION, pas en fin de transaction : échanger deux rangs la violerait avant de la
  // rétablir. Le réordonnancement réécrit donc toutes les positions d'un coup, et le tri
  // public se clôt sur `id` pour rester déterministe si deux positions se valaient.
  position Int

  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product    Product    @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([collectionId, productId])
  @@index([productId])
  @@map("collection_items")
}
```

Et ajouter les relations inverses :

- dans `model Vendor` : `collections Collection[]`
- dans `model Product` : `collectionItems CollectionItem[]`

- [ ] **Étape 2 : générer la migration**

```
docker exec clemperl_dev_api sh -c "cd packages/db && pnpm exec prisma migrate dev --name collections --create-only"
```

`--create-only` : la migration est relue et complétée à la main avant d'être appliquée.

- [ ] **Étape 3 : ajouter la garde du mot réservé**

Ajouter **en tête** du fichier `migration.sql` généré :

```sql
-- `collections` devient un segment de route sous une boutique. Un produit portant déjà ce
-- slug verrait sa page masquée par la route homonyme et répondrait 404, sans message.
-- Échouer ici est préférable : une migration qui casse une URL en silence se découvre en
-- production.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM products WHERE slug = 'collections') THEN
        RAISE EXCEPTION 'un produit porte le slug « collections », qui devient réservé. Le renommer avant de rejouer cette migration.';
    END IF;
END $$;
```

- [ ] **Étape 4 : appliquer et vérifier**

```
pnpm docker:up
docker exec clemperl_dev_postgres psql -U clemperl -d clemperl -c "\d collection_items"
```

Attendu : la table existe, avec l'unicité sur `(collection_id, product_id)` et **aucune**
sur `position`.

---

### Tâche 3 : Le dépôt, et l'extension du catalogue

**Fichiers :**
- Créer : `packages/db/src/repositories/collection.repository.ts`
- Créer : `apps/api/test/collection.int-spec.ts`
- Modifier : `packages/db/src/repositories/index.ts`
- Modifier : `packages/db/src/repositories/catalog.repository.ts`

**Interfaces consommées :** aucune des tâches précédentes.

**Interfaces produites :**
- `listCollectionsForVendor(prisma, vendorId)`
- `readCollectionForVendor(prisma, { vendorId, collectionId })`
- `createCollection(prisma, { vendorId, slug, title })`
- `setCollectionItems(prisma, { collectionId, productIds })`, qui réécrit tout l'ordre
- `setCollectionStatus(prisma, { collectionId, status })`
- `readPublishedCollection(prisma, { shopSlug, slug })`
- `listPublishedCollections(prisma, vendorId)`
- `ICatalogQuery` gagne `collectionId?: string`

- [ ] **Étape 1 : écrire le test d'intégration qui échoue**

`apps/api/test/collection.int-spec.ts`. Le harnais suit celui de
`catalog-repository.int-spec.ts`, préfixe par fichier compris : les suites partagent une
base et un run, et deux suites qui nomment leurs boutiques pareil se marchent dessus, la
panne se lisant alors dans la suite voisine.

```ts
import {
    createCollection,
    createProduct,
    prisma,
    searchPublishedProducts,
    setCollectionItems,
    setProductStatus,
} from "@clemperl/db";

const PREFIX = "collection";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

async function createShop() {
    counter += 1;
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: `Atelier ${counter}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${counter}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${counter} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR" as never,
        },
    });
}

// Un brouillon suffit à prouver les positions, qui ne regardent pas la publication.
async function createDraft(vendorId: string): Promise<string> {
    counter += 1;
    const { id } = await createProduct(prisma, {
        vendorId,
        slug: `${PREFIX}-p-${counter}`,
        title: `Sac cabas ${counter}`,
        description: DESCRIPTION,
        category: "LEATHER_GOODS",
        priceAmount: 18000,
        expectedCurrency: "EUR",
    });
    return id;
}

// Un produit PUBLIÉ complet : une variante et une image prête. Sans l'image, le dépôt
// refuse la publication, garantie solidifiée en T2c.
async function publish(vendorId: string, productId: string): Promise<void> {
    counter += 1;
    await prisma.productImage.create({
        data: {
            productId,
            objectPath: `${productId}/1111111${counter % 10}-2222-3333-4444-555555555555/original.jpg`,
            originalName: "photo.jpg",
            position: 0,
            status: "READY",
            width: 1200,
            height: 800,
        },
    });
    await setProductStatus(prisma, { productId, vendorId, publish: true });
}

async function newCollection(vendorId: string): Promise<string> {
    counter += 1;
    const { id } = await createCollection(prisma, {
        vendorId,
        slug: `${PREFIX}-ete-${counter}`,
        title: "Soldes d'été",
    });
    return id;
}

function positionsOf(collectionId: string) {
    return prisma.collectionItem.findMany({
        where: { collectionId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { productId: true, position: true },
    });
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("setCollectionItems", () => {
    it("réécrit les positions de zéro à n moins un", async () => {
        const shop = await createShop();
        const [a, b, c] = [
            await createDraft(shop.id),
            await createDraft(shop.id),
            await createDraft(shop.id),
        ];
        const collectionId = await newCollection(shop.id);

        await setCollectionItems(prisma, { collectionId, productIds: [a, b, c] });
        await setCollectionItems(prisma, { collectionId, productIds: [c, b, a] });

        expect(await positionsOf(collectionId)).toEqual([
            { productId: c, position: 0 },
            { productId: b, position: 1 },
            { productId: a, position: 2 },
        ]);
    });

    // Un retrait ne doit pas laisser 0 et 2 : les positions sont un rang, pas une étiquette.
    it("referme le trou laissé par un retrait", async () => {
        const shop = await createShop();
        const [a, b, c] = [
            await createDraft(shop.id),
            await createDraft(shop.id),
            await createDraft(shop.id),
        ];
        const collectionId = await newCollection(shop.id);

        await setCollectionItems(prisma, { collectionId, productIds: [a, b, c] });
        await setCollectionItems(prisma, { collectionId, productIds: [a, c] });

        expect(await positionsOf(collectionId)).toEqual([
            { productId: a, position: 0 },
            { productId: c, position: 1 },
        ]);
    });

    // LE point de la tâche. Une contrainte d'unicité sur `position` rendrait cet échange
    // impossible : la première écriture la violerait avant que la seconde ne la rétablisse.
    it("échange deux rangs sans rien violer", async () => {
        const shop = await createShop();
        const [a, b] = [await createDraft(shop.id), await createDraft(shop.id)];
        const collectionId = await newCollection(shop.id);

        await setCollectionItems(prisma, { collectionId, productIds: [a, b] });
        await expect(
            setCollectionItems(prisma, { collectionId, productIds: [b, a] }),
        ).resolves.not.toThrow();

        expect(await positionsOf(collectionId)).toEqual([
            { productId: b, position: 0 },
            { productId: a, position: 1 },
        ]);
    });

    // Une collection qui pointerait vers un produit disparu afficherait un trou que
    // personne ne saurait expliquer.
    it("emporte ses lignes quand le produit est supprimé", async () => {
        const shop = await createShop();
        const [a, b] = [await createDraft(shop.id), await createDraft(shop.id)];
        const collectionId = await newCollection(shop.id);
        await setCollectionItems(prisma, { collectionId, productIds: [a, b] });

        await prisma.product.delete({ where: { id: a } });

        expect(await positionsOf(collectionId)).toEqual([{ productId: b, position: 1 }]);
    });
});

describe("le filtre de collection sur le catalogue", () => {
    // La page publique n'a pas sa propre requête : elle ajoute un fragment aux conditions
    // du catalogue. Ce test est la garantie qu'elle hérite bien de l'éligibilité, au lieu
    // de la recopier. La revue de T2d a payé exactement cet écart.
    it("ne rend que les produits publiés de la collection", async () => {
        const shop = await createShop();
        const visible = await createDraft(shop.id);
        const brouillon = await createDraft(shop.id);
        await publish(shop.id, visible);

        const collectionId = await newCollection(shop.id);
        await setCollectionItems(prisma, { collectionId, productIds: [visible, brouillon] });

        const { rows, total } = await searchPublishedProducts(prisma, {
            search: null,
            category: null,
            sort: "collection",
            currency: "EUR",
            collectionId,
            limit: 24,
            offset: 0,
        });

        expect(total).toBe(1);
        expect(rows.map((row) => row.id)).toEqual([visible]);
    });
});
```

- [ ] **Étape 2 : lancer la suite et constater l'échec**

Demander d'abord aux autres sessions si la stack est libre, puis :

```
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand -t setCollectionItems"
```

Attendu : ÉCHEC, `setCollectionItems is not a function`.

- [ ] **Étape 3 : écrire le dépôt**

`packages/db/src/repositories/collection.repository.ts`. Le cœur, qui porte la décision :

```ts
export interface ISetCollectionItems {
    collectionId: string;
    productIds: string[];
}

// Tout l'ordre est réécrit, pas seulement les deux lignes qui bougent. C'est ce qui rend
// l'échange possible sans contrainte d'unicité sur `position`, et ce qui referme les trous
// laissés par un retrait. Une collection est un choix humain, donc une poignée de lignes.
export async function setCollectionItems(
    prisma: PrismaClient,
    input: ISetCollectionItems,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.collectionItem.deleteMany({ where: { collectionId: input.collectionId } });
        await tx.collectionItem.createMany({
            data: input.productIds.map((productId, position) => ({
                collectionId: input.collectionId,
                productId,
                position,
            })),
        });
    });
}
```

Les autres fonctions suivent la forme des dépôts existants : `prisma` en premier
paramètre, aucun état de module, des primitives en entrée.

- [ ] **Étape 4 : étendre le catalogue plutôt que le dupliquer**

`packages/db/src/repositories/catalog.repository.ts`. La page publique n'a pas sa propre
requête : recopier les conditions d'éligibilité créerait une seconde vérité, le défaut
exact que la revue de T2d a trouvé sur le décompte des devises.

**1. Étendre l'entrée :**

```ts
export interface ICatalogQuery {
    search: string | null;
    category: string | null;
    sort: string;
    currency: string;
    shopSlug?: string;
    collectionId?: string;
    limit: number;
    offset: number;
}
```

**2. Joindre, plutôt que d'ajouter une condition `EXISTS`.** Une jointure INTERNE filtre
déjà, et elle rend `ci.position` disponible au tri. Un `EXISTS` aurait demandé une seconde
lecture de la même table pour trier.

```ts
// La jointure n'existe QUE lorsqu'une collection est demandée. `Prisma.empty` rend un
// fragment vide, donc la requête du catalogue global reste exactement ce qu'elle était.
// Interne et non `LEFT` : un produit hors de la collection ne doit pas sortir, et la
// jointure remplace ainsi la condition de filtrage.
function collectionJoin(input: ICatalogQuery): Prisma.Sql {
    return input.collectionId === undefined
        ? Prisma.empty
        : Prisma.sql`JOIN collection_items ci
                       ON ci.product_id = p.id
                      AND ci.collection_id = ${input.collectionId}`;
}
```

La valeur passe par l'interpolation de `Prisma.sql`, donc devient un paramètre lié : la
règle 1 de l'en-tête du fichier tient.

**3. Ajouter l'ordre à la table fermée :**

```ts
    // L'ordre choisi par le vendeur. `ci` n'existe que si `collectionJoin` a produit sa
    // jointure, d'où la garde de `orderFor` ci-dessous : demander ce tri sans collection
    // produirait un `ORDER BY` sur une table absente, donc une erreur SQL à l'exécution.
    collection: Prisma.raw(`MIN(ci.position) ASC, p.id ASC`),
```

`MIN` et non `ci.position` nu : la requête porte un `GROUP BY p.id`, donc toute colonne
non groupée doit être agrégée. Un produit n'apparaît qu'une fois par collection, grâce à
l'unicité `(collection_id, product_id)`, donc `MIN` rend sa position et rien d'autre.

Le tri se clôt sur `p.id` comme les autres. Deux positions égales ne devraient pas exister,
mais la revue de T2d a montré ce que coûte un tri non déterministe : `LIMIT/OFFSET` répète
une ligne sur une page et en saute une autre, et un produit devient invisible sans rien
signaler.

**4. Garder le tri inatteignable sans collection :**

```ts
function orderFor(sort: string, hasCollection: boolean): Prisma.Sql {
    // `collection` trie sur une table qui n'est jointe que pour une collection. Le
    // demander sans elle ferait échouer la requête, donc on retombe sur le défaut.
    const cle = sort === "collection" && !hasCollection ? "newest" : sort;
    return Object.hasOwn(ORDERS, cle) ? (ORDERS[cle] as Prisma.Sql) : (ORDERS["newest"] as Prisma.Sql);
}
```

**5. Câbler dans les deux requêtes.** `searchPublishedProducts` fait une requête de lignes
ET une de décompte, toutes deux avec le même `FROM`. La jointure doit être posée dans les
deux, sinon le décompte compte des produits que la liste ne montre pas. C'est, mot pour
mot, le défaut que la revue de T2d a trouvé sur `listCatalogCurrencies`.

Insérer `${collectionJoin(input)}` **après** `JOIN product_variants v ...` et avant
`${IMAGE_JOIN}`, dans les deux requêtes, et remplacer `orderFor(input.sort)` par
`orderFor(input.sort, input.collectionId !== undefined)`.

- [ ] **Étape 5 : exporter et vérifier**

```ts
// packages/db/src/repositories/index.ts
export * from "./collection.repository.js";
```

```
pnpm --filter @clemperl/db build
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : les nouveaux tests passent, **et les suites de T2b, T2c et T2d passent toujours**.

> **Attention au cache Turbo.** Si `build` rend un *cache hit* alors qu'un fichier vient
> d'être ajouté, relancer avec `--force`. Ce cache a déjà masqué un fichier manquant.

---

### Tâche 4 : L'écran vendeur

**Fichiers :**
- Créer : `apps/vendor/src/app/collections/page.tsx`
- Créer : `apps/vendor/src/app/collections/actions.ts`
- Créer : `apps/vendor/src/app/collections/types/collection-form-state.interface.ts`
- Créer : `apps/vendor/src/app/collections/new/page.tsx`
- Créer : `apps/vendor/src/app/collections/new/new-collection-form.tsx`
- Créer : `apps/vendor/src/app/collections/[id]/page.tsx`
- Créer : `apps/vendor/src/app/collections/[id]/actions.ts`
- Créer : `apps/vendor/src/app/collections/[id]/collection-items.tsx`
- Modifier : `apps/vendor/src/app/layout.tsx`
- Modifier : `packages/i18n/messages/vendor/fr.json`

**Interfaces consommées :** `moveItem` (tâche 1), le dépôt (tâche 3).

- [ ] **Étape 1 : lire la forme existante avant d'écrire**

`apps/vendor/src/app/products/` porte exactement la même structure : une liste, un
formulaire de création, une page de détail avec ses actions. La relire et la suivre, plutôt
que d'inventer une seconde organisation pour le même besoin.

- [ ] **Étape 2 : écrire la copie**

Ajouter une section `collections` à `packages/i18n/messages/vendor/fr.json`, sur la forme
de la section `products` existante. Elle porte au minimum : le titre de la liste, le vide
(« Vous n'avez pas encore de collection. »), les libellés du formulaire, « Monter »,
« Descendre », « Retirer », « Ajouter un produit », « Publier », et les messages d'erreur.

- [ ] **Étape 3 : écrire les écrans**

La page de détail rend la liste ordonnée, chaque ligne portant son rang, deux boutons et
un retrait. Les boutons sont de vrais `<button>` dans un `<form>` d'action serveur, pas du
glisser-déposer : accessibles au clavier d'office, et visables par
`getByRole("button", { name: "Monter" })`.

L'action de déplacement lit l'ordre courant, appelle `moveItem`, et passe le résultat à
`setCollectionItems`. Aucun réordonnancement optimiste côté client : l'ordre est la donnée,
et un affichage qui anticiperait l'écriture mentirait si elle échouait.

Un article dépublié reste listé, à son rang, signalé comme non visible publiquement.

- [ ] **Étape 4 : ajouter le lien dans l'en-tête**

`apps/vendor/src/app/layout.tsx` porte déjà des liens vers `/shop` et `/products`. Ajouter
`/collections` à côté.

- [ ] **Étape 5 : vérifier à l'œil, pas seulement au test**

Ouvrir l'espace vendeur, créer une collection, y ranger deux articles, les inverser,
recharger. L'ordre tient. Constater aussi que **la page est stylée** : pendant T1b, les
utilitaires Tailwind d'un paquet partagé n'étaient pas générés, la page se rendait, les
classes étaient sur les éléments et ne correspondaient à rien.

---

### Tâche 5 : La page publique

**Fichiers :**
- Créer : `apps/storefront/src/app/[locale]/shops/[shop]/collections/[collection]/page.tsx`
- Modifier : `apps/storefront/src/app/[locale]/shops/[shop]/page.tsx`
- Modifier : `packages/i18n/messages/storefront/fr.json`
- Modifier : `packages/i18n/messages/storefront/en.json`

**Interfaces consommées :** `readPublishedCollection`, `listPublishedCollections`,
`searchPublishedProducts` étendu (tâche 3).

- [ ] **Étape 1 : écrire la page**

Elle lit la collection par `(shopSlug, slug)`, répond `notFound()` si elle n'existe pas ou
n'est pas publiée, puis appelle `searchPublishedProducts` avec `collectionId`, `shopSlug`,
`sort: "collection"` et **la devise de la boutique**, pas celle du cookie. La vitrine fait
déjà ce choix et son code en porte la raison : borner au cookie ferait disparaître les
produits de la boutique qu'on est venu voir.

Aucun contrôle de tri. Pagination à vingt-quatre, comme ailleurs.

Réutiliser la carte produit et l'assistant de prix partagé introduits par la revue de T2d,
pour que la collection, la vitrine et le catalogue formatent de la même façon. **Les
localiser avant d'écrire**, et ne surtout pas en recopier une variante.

- [ ] **Étape 2 : lister les collections sur la vitrine**

`apps/storefront/src/app/[locale]/shops/[shop]/page.tsx` : afficher les collections
**publiées** de la boutique au-dessus de la grille, chacune liant vers sa page. Rien
d'autre : il n'y a pas de page d'index, et `/shops/<shop>/collections` répond 404, ce qui
est correct.

- [ ] **Étape 3 : vérifier**

```
pnpm --filter @clemperl/storefront typecheck
```

Puis au navigateur : une collection publiée se visite, une collection en brouillon répond
404, et un article dépublié n'y figure plus.

---

### Tâche 6 : Le parcours navigateur, la passation, et le commit

**Fichiers :**
- Créer : `e2e/collection.spec.ts`
- Modifier : `docs/passation.md`

- [ ] **Étape 1 : écrire le parcours**

`e2e/collection.spec.ts`. Relire `e2e/catalog.spec.ts` d'abord : il porte le harnais de
création d'une boutique validée avec un produit publié, et c'est lui qu'il faut réutiliser.

Le parcours : le vendeur crée une collection, y range deux articles, les inverse, publie.
Le visiteur sans compte ouvre la vitrine, suit le lien, et voit les deux articles **dans
l'ordre choisi**. Puis le vendeur dépublie le premier, et le visiteur ne voit plus que le
second.

> **Chercher un texte qui peut être le titre de la page se fait dans `main`.** L'annonceur
> de route de Next porte ce titre hors de `main`, et un `getByText` non restreint en trouve
> deux. Entrée consignée dans `docs/pieges.md`, payée deux fois.

- [ ] **Étape 2 : lancer la suite**

Demander d'abord aux autres sessions si la stack est libre.

```
pnpm docker:up
pnpm test:e2e
```

Attendu : le nouveau parcours passe, **et les suites existantes aussi**.

> Si un test échoue par intermittence, **instrumenter avant de corriger**. Six corrections
> devinées ont échoué pendant T1b avant qu'une trace du navigateur ne donne la cause.

- [ ] **Étape 3 : vérification complète**

```
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Aucun plancher de couverture n'a été **baissé** : si l'un bloque, la réponse est d'écrire
le test manquant.

- [ ] **Étape 4 : mettre la passation à jour**

- Table des tranches : T2e **Livrée**
- Ajouter ce qui reste ouvert : pas d'ordre manuel au-delà d'une collection raisonnable
  (toutes les positions sont réécrites à chaque clic), pas de collection de plateforme, pas
  de collection transversale à plusieurs boutiques
- Retirer de « ce qui reste ouvert » la ligne qui annonçait les collections comme à venir

- [ ] **Étape 5 : compter les fichiers, puis commiter**

```
git diff --stat main...HEAD | tail -1
```

Sous 100, sinon découper. Puis un seul commit, message **court** :

```bash
git add -A
git commit -m "feat(catalog): vendor collections, ordered by hand

A vendor groups products into a collection, picks their order and
publishes it under the shop. The order is rewritten whole on each move,
which is why position carries no unique constraint.

See docs/superpowers/specs/2026-10-03-t2e-collections-design.md"
```

- [ ] **Étape 6 : ouvrir la PR**

```bash
git push -u origin feat/product-collections
```

PR **vers `main`**, corps sous 1500 caractères (`wc -m`), portant dans cet ordre : ce qui
change, ce qui n'est pas armé, ce qui n'a pas été vérifié, les suites hors périmètre.

**Ouvrir la PR dès le premier push**, même en brouillon : `ci.yml` ne se déclenche que sur
`pull_request` ou sur un push vers `main`, donc une branche poussée seule n'est vérifiée
par rien.

---

## Couverture de la spec par les tâches

| Section de la spec | Tâche |
|---|---|
| §4 Le modèle, et pourquoi `position` n'est pas unique | 2, 3 |
| §5 Le mot réservé et la route | 1, 2 |
| §6 L'écran vendeur, boutons plutôt que glisser-déposer | 4 |
| §7 La page publique, conditions partagées, devise de la boutique | 3, 5 |
| §8 Tests | 1, 3, 6 |
| §9 Critères 1 à 4 | 4, 5, 6 |
| §9 Critère 5 | 1 |
| §9 Critère 6 | 5 |
| §9 Critère 7 | 6 |
