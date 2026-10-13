# T5, suspendre une boutique : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un administrateur suspend une boutique, ses articles quittent le catalogue, et son
vendeur garde son espace en lisant pourquoi.

**Architecture:** deux colonnes sur `Vendor`, une condition de plus dans le prédicat
d'éligibilité déjà partagé par six lectures, deux fonctions de dépôt, un écran
d'administration et un bandeau côté vendeur. Aucun montant, aucune échéance, aucune tâche
planifiée.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7, PostgreSQL, next-intl,
Tailwind 4, Vitest, Jest + Testcontainers, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-t5-suspension-boutique-design.md`

## Global Constraints

- **Aucun commit intermédiaire par les agents.** `docs/conventions/git.md` interdit `add`,
  `commit`, `push`, `switch`, `branch` à un agent : écrire les commandes exactes et les
  faire exécuter. Un seul commit de fin de chantier, court, en anglais. La spec et ce plan
  y voyagent.
- **Aucun tiret cadratin (`—`) ni demi-cadratin (`–`)** nulle part : prose, commentaires,
  libellés. Voir `docs/conventions/redaction.md`.
- **Ce qu'une machine lit est en anglais** : identifiants, noms de fichiers, segments
  d'URL, clés de traduction, noms de relation Prisma. **Ce qu'un humain lit est en
  français**, dans `packages/i18n`.
- **Les commentaires décrivent le code AU PRÉSENT**, ne narrent jamais un état antérieur, et
  ne citent JAMAIS un numéro de tâche, de spec ou de section (`docs/conventions/code.md:51`).
  Un nom de TRANCHE (T2d, T4) est un identifiant stable et reste autorisé.
- **Indentation à 4 espaces, tenue à la main. NE PAS lancer Prettier** : aucune
  configuration n'existe, et son défaut reformaterait le dépôt.
- **`packages/db` ne peut importer ni `packages/domain` ni `apps/api`.**
- **Les refus se vérifient avec `rejects.toMatchObject({ message: CONST })`**, jamais
  `rejects.toThrow(CONST)`, qui compare par sous-chaîne.
- **`revalidatePath` prend le MOTIF de route**, jamais le chemin rendu.
- **Après toute édition de `packages/db/src`, reconstruire `packages/db/dist`** : il est
  ignoré par Git et Jest importe DEPUIS lui. Un oubli fait tourner les tests contre du code
  périmé, et leur vert ne veut rien dire.
- **Un glob `*.spec.ts` ne voit PAS `*.int-spec.ts`.** Chercher avec `*spec.ts`.
- **Avant toute suite Testcontainers, demander aux autres sessions Claude** si l'une d'elles
  en exécute : deux réacteurs Ryuk concurrents font tomber l'environnement de
  développement.
- **Avant d'écrire du code Next**, lire le guide concerné dans `node_modules/next/dist/docs/`
  comme l'`AGENTS.md` de chaque front l'exige : cette version a des ruptures d'API.

## Review Focus

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exercerait d'elle-même.
Chaque ligne a son test, dans la tâche qui possède le code.

1. **Une boutique suspendue dont un article est déjà dans un panier.** La validation la
   refuse, le panier reste intact, et l'acheteur lit le refus existant pour un article
   devenu indisponible. Testé en tâche 2.
2. **Les commandes d'une boutique suspendue.** Elles restent lisibles ET actionnables des
   deux côtés : un acheteur ne perd jamais l'accès à ce qu'il a payé. Testé en tâche 2.
3. **L'accès des membres à leur espace.** `readVendorForMember` ne doit PAS gagner la
   condition, sans quoi un vendeur suspendu perd l'écran où il traite ses commandes. Testé
   en tâche 2.
4. **Suspendre une boutique déjà suspendue, ou rétablir une boutique active.** Aucune
   erreur, l'état visé est atteint, et une seconde suspension ne réécrit pas la date de la
   première par surprise. Testé en tâche 3.
5. **Un administrateur dont le compte est supprimé après avoir suspendu.** La boutique reste
   suspendue et la ligne de l'écran ne casse pas : `suspendedById` passe à nul par
   `SetNull`, donc le nom disparaît et l'état demeure. Testé en tâche 3.

## File Structure

**Créés**

| Fichier | Responsabilité |
| --- | --- |
| `packages/db/prisma/migrations/<horodatage>_shop_suspension/migration.sql` | Les deux colonnes et leur clé étrangère |
| `apps/admin/src/app/shops/page.tsx` | La liste des boutiques et leur état |
| `apps/admin/src/app/shops/actions.ts` | Suspendre et rétablir |
| `apps/admin/src/app/shops/suspension-form.tsx` | Le bouton d'une ligne, composant client |
| `apps/admin/src/app/shops/types/suspension-state.interface.ts` | L'état de l'action et sa valeur initiale |
| `apps/vendor/src/app/components/shop-offline.tsx` | Le bandeau, composant serveur |
| `apps/api/test/shop-suspension.int-spec.ts` | Ce que la suspension fait, et ce qu'elle ne fait pas |
| `e2e/shop-suspension.spec.ts` | Le parcours complet |

**Modifiés**

| Fichier | Changement |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `suspendedAt`, `suspendedById`, la relation et son inverse |
| `packages/db/src/repositories/catalog.repository.ts` | `conditions()`, le décompte des devises, `readPublishedProduct`, `readPublishedShop` |
| `packages/db/src/repositories/cart.repository.ts` | `eligibleVariantWhere` |
| `packages/db/src/repositories/vendor.repository.ts` | `listShopsForAdministration`, `setShopSuspension` |
| `apps/api/test/payment-eligibility.int-spec.ts` | La sixième lecture dans le test des lectures |
| `apps/admin/src/app/layout.tsx` | Un lien de navigation |
| `apps/vendor/src/app/shop/page.tsx`, `products/page.tsx`, `orders/page.tsx` | Le bandeau |
| `packages/i18n/messages/admin/fr.json`, `packages/i18n/messages/vendor/fr.json` | Les libellés |
| `docs/passation.md`, `docs/pieges.md` | Ce que la tranche laisse derrière elle |

---

## Task 1: Le modèle et la migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<horodatage>_shop_suspension/migration.sql`

**Interfaces:**
- Consumes: rien.
- Produces: `Vendor.suspendedAt: Date | null`, `Vendor.suspendedById: string | null`, la
  relation `suspendedBy` vers `User` et son inverse `suspendedShops`.

- [ ] **Step 1: Déclarer les deux colonnes**

Dans `model Vendor`, après `currency` et avant les horodatages :

```prisma
  // Une boutique suspendue ne vend plus : ses articles quittent le catalogue. Un
  // horodatage et non un booléen, parce que l'écran d'administration montre depuis quand.
  //
  // À ne pas confondre avec `deletedAt`, juste en dessous : une fermeture est définitive et
  // retire au vendeur l'accès à son espace, une suspension revient et le lui laisse.
  suspendedAt   DateTime? @map("suspended_at")

  // QUI a suspendu. Le paiement se négocie hors de la plateforme, donc cet acte n'a aucune
  // preuve extérieure : dire qui l'a posé est le minimum qu'on puisse en garder.
  suspendedById String?   @map("suspended_by_id")
```

Et dans les relations du même modèle :

```prisma
  // `SetNull` : supprimer un compte n'efface pas l'histoire de la boutique, il en retire
  // seulement le nom.
  suspendedBy User? @relation("SuspendedShops", fields: [suspendedById], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Déclarer la relation inverse sur `User`**

Prisma exige les deux côtés. Dans `model User`, après `vendorMemberships` :

```prisma
  suspendedShops Vendor[] @relation("SuspendedShops")
```

Le nom est en ANGLAIS, comme tout identifiant. Le voisin `@relation("DecisionsRendues")` est
en français : c'est une entorse antérieure, et la recopier en ajouterait une seconde.

- [ ] **Step 3: Produire la migration**

```bash
pnpm docker:up
docker compose --env-file .env -f docker/docker-compose.dev.yml \
  run --rm --no-deps migrate sh -c "pnpm --filter @clemperl/db exec prisma migrate dev --name shop_suspension --create-only"
```

Si les fichiers sortent en `uid 0` :

```bash
docker compose --env-file .env -f docker/docker-compose.dev.yml \
  run --rm --no-deps --user root migrate \
  sh -c "chown -R 1000:1000 /app/packages/db/prisma/migrations"
```

- [ ] **Step 4: Relire la migration**

Elle ne doit RIEN reprendre : les deux colonnes naissent nulles, donc toutes les boutiques
existantes sont actives, ce qui est l'état voulu. Le fichier doit ressembler à ceci, aux noms
de contrainte près, que Prisma choisit et qu'il faut garder tels quels :

```sql
ALTER TABLE "vendors" ADD COLUMN "suspended_at" TIMESTAMP(3);
ALTER TABLE "vendors" ADD COLUMN "suspended_by_id" TEXT;

ALTER TABLE "vendors" ADD CONSTRAINT "vendors_suspended_by_id_fkey"
    FOREIGN KEY ("suspended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

S'il contient un `UPDATE`, un `NOT NULL` ou un `DEFAULT`, quelque chose a été mal déclaré :
s'arrêter et le dire.

- [ ] **Step 5: Appliquer et vérifier**

```bash
pnpm docker:up
docker compose --env-file .env -f docker/docker-compose.dev.yml \
  run --rm --no-deps migrate sh -c "pnpm --filter @clemperl/db exec prisma migrate status"
pnpm --filter @clemperl/db exec prisma validate
pnpm typecheck
```

Attendu : aucune migration en attente, aucune dérive, et `typecheck` à 15/15.

---

## Task 2: L'éligibilité, une condition et six lectures

**Files:**
- Modify: `packages/db/src/repositories/cart.repository.ts` (`eligibleVariantWhere`)
- Modify: `packages/db/src/repositories/catalog.repository.ts` (`conditions`, `listCatalogCurrencies`, `readPublishedProduct`, `readPublishedShop`)
- Modify: `apps/api/test/payment-eligibility.int-spec.ts`
- Create: `apps/api/test/shop-suspension.int-spec.ts`

**Interfaces:**
- Consumes: `Vendor.suspendedAt` de la tâche 1.
- Produces: rien de nouveau. Aucune signature ne change.

- [ ] **Step 1: Écrire le test des six lectures**

Dans `apps/api/test/payment-eligibility.int-spec.ts`, le `describe` existant épingle déjà
cinq lectures pour les méthodes de paiement. Ajouter un `describe` frère qui fait la même
chose pour la suspension, en réutilisant les mêmes aides.

```ts
describe("une boutique suspendue", () => {
    // La condition est écrite UNE fois et lue à six endroits. Ce test échoue dès que l'une
    // d'elles la perd, chacune sur sa propre assertion.
    it("quitte les cinq lectures à la fois", async () => {
        const shop = await createShopWithPublishedProduct({ methods: ["OFF_PLATFORM"] });

        await expect(searchPublishedProducts(prisma, catalogQuery(shop))).resolves.toMatchObject({ total: 1 });
        await expect(
            readPublishedProduct(prisma, { shopSlug: shop.slug, productSlug: shop.productSlug }),
        ).resolves.not.toBeNull();
        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.not.toBeNull();
        await expect(
            prisma.productVariant.findFirst({ where: eligibleVariantWhere(shop.variantId) }),
        ).resolves.not.toBeNull();

        await prisma.vendor.update({
            where: { id: shop.id },
            data: { suspendedAt: new Date() },
        });

        await expect(searchPublishedProducts(prisma, catalogQuery(shop))).resolves.toMatchObject({ total: 0 });
        await expect(
            readPublishedProduct(prisma, { shopSlug: shop.slug, productSlug: shop.productSlug }),
        ).resolves.toBeNull();
        await expect(readPublishedShop(prisma, { shopSlug: shop.slug })).resolves.toBeNull();
        await expect(
            prisma.productVariant.findFirst({ where: eligibleVariantWhere(shop.variantId) }),
        ).resolves.toBeNull();
    });

    // Le décompte des devises a son PROPRE SQL, et c'est celui que la revue de T2d avait
    // trouvé désaligné : il comptait des produits que la liste ne montrait pas.
    it("ne compte plus dans le décompte des devises", async () => {
        const shop = await createShopWithPublishedProduct({ methods: ["OFF_PLATFORM"] });
        const avant = await listCatalogCurrencies(prisma);
        await prisma.vendor.update({ where: { id: shop.id }, data: { suspendedAt: new Date() } });
        const apres = await listCatalogCurrencies(prisma);

        const compte = (rows: { currency: string; productCount: number }[]) =>
            rows.find((r) => r.currency === shop.currency)?.productCount ?? 0;
        expect(compte(apres)).toBe(compte(avant) - 1);
    });
});
```

Relire les noms exacts des aides du fichier avant d'écrire, et les réutiliser plutôt que
d'en créer.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

```bash
pnpm --filter @clemperl/api test:integration -- payment-eligibility
```

Attendu : ÉCHEC. Après la suspension, les cinq lectures rendent encore la boutique, aucune ne
connaissant la condition.

- [ ] **Step 3: Ajouter la condition aux quatre lectures Prisma**

Dans `cart.repository.ts`, `eligibleVariantWhere`, et dans son commentaire qui ÉNUMÈRE les
conditions et doit rester vrai :

```ts
            vendor: {
                deletedAt: null,
                suspendedAt: null,
                currency: { not: null },
                paymentMethods: { isEmpty: false },
            },
```

Dans `catalog.repository.ts`, la même ligne dans le `where` de `readPublishedProduct`, et
dans celui de `readPublishedShop`.

- [ ] **Step 4: Ajouter la condition aux deux lectures SQL**

Dans `conditions()`, à la suite des conditions fixes :

```ts
        // Une boutique suspendue ne vend plus. La condition vit ICI, dans la liste
        // partagée, et non dans la seule requête des lignes : le décompte compterait sinon
        // des produits que la liste ne montre pas.
        Prisma.sql`s.suspended_at IS NULL`,
```

Et dans le SQL propre de `listCatalogCurrencies`, à côté des siennes :

```sql
              AND s.currency IS NOT NULL AND cardinality(s.payment_methods) > 0
              AND s.suspended_at IS NULL
              AND i.object_path IS NOT NULL
```

- [ ] **Step 5: Lancer le test et vérifier qu'il passe**

```bash
pnpm --filter @clemperl/db exec tsc -p tsconfig.build.json
pnpm --filter @clemperl/api test:integration -- payment-eligibility
```

Attendu : PASSE.

- [ ] **Step 6: Écrire le test de ce que la suspension NE fait PAS**

Nouveau fichier `apps/api/test/shop-suspension.int-spec.ts`, `PREFIX` vaut `"susp"`. Reprendre
les aides de `apps/api/test/order-repository.int-spec.ts` pour créer compte, boutique,
produit publié, panier et commande.

Ce test est le plus important de la tâche : il épingle trois décisions que rien d'autre ne
tient, et dont l'oubli ferait perdre à un vendeur l'écran où il travaille.

```ts
describe("ce qu'une suspension ne touche pas", () => {
    // Un acheteur ne perd JAMAIS l'accès à une commande qu'il a payée, et un vendeur doit
    // pouvoir expédier ce qu'il a déjà vendu.
    it("laisse les commandes lisibles des deux côtés", async () => {
        const order = await placedOrder();
        await prisma.vendor.update({ where: { id: order.vendorId }, data: { suspendedAt: new Date() } });

        await expect(
            readOrderForBuyer(prisma, { buyerId: order.buyerId, reference: order.reference }),
        ).resolves.not.toBeNull();
        await expect(
            readOrderForVendor(prisma, { vendorId: order.vendorId, orderId: order.id }),
        ).resolves.not.toBeNull();
        expect(await listOrdersForBuyer(prisma, order.buyerId)).toHaveLength(1);
        expect(await listOrdersForVendor(prisma, order.vendorId)).toHaveLength(1);
    });

    // La commande reste ACTIONNABLE, pas seulement visible : un vendeur suspendu expédie
    // ce qu'il doit.
    it("laisse le vendeur faire avancer une commande", async () => {
        const order = await placedOrder();
        await prisma.vendor.update({ where: { id: order.vendorId }, data: { suspendedAt: new Date() } });

        await setOrderStatus(prisma, {
            vendorId: order.vendorId,
            orderId: order.id,
            from: "PLACED",
            status: "ACCEPTED",
        });
        const after = await prisma.order.findUnique({ where: { id: order.id } });
        expect(after?.status).toBe("ACCEPTED");
    });

    // `readVendorForMember` ouvre l'espace vendeur. Y ajouter la condition ferait perdre
    // son écran à quelqu'un qui doit continuer à travailler.
    it("laisse les membres accéder à leur espace", async () => {
        const order = await placedOrder();
        await prisma.vendor.update({ where: { id: order.vendorId }, data: { suspendedAt: new Date() } });

        await expect(readVendorForMember(prisma, order.memberId)).resolves.not.toBeNull();
    });

    // Une boutique FERMÉE, elle, retire bien l'espace : les deux colonnes se ressemblent et
    // ne font pas la même chose.
    it("contrairement à une fermeture, qui retire l'espace", async () => {
        const order = await placedOrder();
        await prisma.vendor.update({ where: { id: order.vendorId }, data: { deletedAt: new Date() } });

        await expect(readVendorForMember(prisma, order.memberId)).resolves.toBeNull();
    });
});

describe("une boutique suspendue et un panier", () => {
    // Le panier GARDE la ligne, et c'est la validation qui refuse : l'acheteur lit le refus
    // que T3 a déjà écrit pour un article devenu indisponible.
    it("refuse la validation et laisse le panier intact", async () => {
        const { userId, shop, variantId } = await setup();
        await addItem({ userId, variantId, quantity: 1 });
        await prisma.vendor.update({ where: { id: shop.id }, data: { suspendedAt: new Date() } });

        await expect(
            placeOrders(prisma, {
                userId,
                expectedTotal: PRICE,
                shipTo: SHIP_TO,
                notes: {},
                methods: { [shop.slug]: "OFF_PLATFORM" },
                lines: [{ variantId, label: "" }],
            }),
        ).rejects.toMatchObject({ message: ERROR_ITEM_INELIGIBLE });

        const cart = await readCart(prisma, userId);
        expect(cart?.lines).toHaveLength(1);
    });
});
```

- [ ] **Step 7: Lancer ce test et vérifier qu'il passe**

```bash
pnpm --filter @clemperl/api test:integration -- shop-suspension
```

Attendu : PASSE sans qu'aucun code de production n'ait été écrit pour lui. C'est voulu : il
épingle l'absence de changement, et il rougira le jour où quelqu'un ajoutera la condition au
mauvais endroit.

- [ ] **Step 8: Vérifier la tâche**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @clemperl/api test:integration
```

Attendu : tout passe. Les trois suites de stockage échouent depuis l'hôte sur des noms
d'hôtes du réseau Docker : c'est environnemental et préexistant.

---

## Task 3: Le dépôt, lister et basculer

**Files:**
- Modify: `packages/db/src/repositories/vendor.repository.ts`
- Modify: `apps/api/test/shop-suspension.int-spec.ts`

**Interfaces:**
- Consumes: `Vendor.suspendedAt` et `suspendedById` de la tâche 1.
- Produces:
  `listShopsForAdministration(prisma): Promise<{ id, slug, shopName, suspendedAt, suspendedBy: { name } | null }[]>`
  et `setShopSuspension(prisma, { vendorId, administratorId, suspended }): Promise<void>`.

- [ ] **Step 1: Écrire les tests**

Dans `apps/api/test/shop-suspension.int-spec.ts` :

```ts
describe("setShopSuspension", () => {
    it("suspend en gardant qui et quand", async () => {
        const { shop, adminId } = await setupWithAdministrator();

        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: true });

        const after = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(after.suspendedAt).not.toBeNull();
        expect(after.suspendedById).toBe(adminId);
    });

    it("rétablit en effaçant les deux colonnes ensemble", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: true });

        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: false });

        const after = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(after.suspendedAt).toBeNull();
        expect(after.suspendedById).toBeNull();
    });

    // Deux administrateurs, ou un double clic. L'état visé est atteint et rien ne lève.
    it("accepte de suspendre une boutique déjà suspendue sans bouger la date", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: true });
        const premiere = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });

        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: true });

        const seconde = await prisma.vendor.findUniqueOrThrow({ where: { id: shop.id } });
        expect(seconde.suspendedAt).toEqual(premiere.suspendedAt);
    });

    it("accepte de rétablir une boutique active", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await expect(
            setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: false }),
        ).resolves.toBeUndefined();
    });
});

describe("listShopsForAdministration", () => {
    it("rend l'état et le nom de qui a suspendu", async () => {
        const { shop, adminId, adminName } = await setupWithAdministrator();
        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: true });

        const rows = await listShopsForAdministration(prisma);
        const row = rows.find((r) => r.id === shop.id);
        expect(row?.suspendedAt).not.toBeNull();
        expect(row?.suspendedBy?.name).toBe(adminName);
    });

    // `SetNull` : la boutique reste suspendue, seul le nom disparaît. La ligne de l'écran
    // ne doit pas casser pour autant.
    it("survit à la suppression du compte qui a suspendu", async () => {
        const { shop, adminId } = await setupWithAdministrator();
        await setShopSuspension(prisma, { vendorId: shop.id, administratorId: adminId, suspended: true });

        await prisma.user.delete({ where: { id: adminId } });

        const row = (await listShopsForAdministration(prisma)).find((r) => r.id === shop.id);
        expect(row?.suspendedAt).not.toBeNull();
        expect(row?.suspendedBy).toBeNull();
    });

    it("ne rend pas une boutique fermée", async () => {
        const { shop } = await setupWithAdministrator();
        await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

        expect((await listShopsForAdministration(prisma)).find((r) => r.id === shop.id)).toBeUndefined();
    });
});
```

`setupWithAdministrator` crée une boutique et un compte `ADMIN` avec un nom, et rend
`{ shop, adminId, adminName }`.

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

```bash
pnpm --filter @clemperl/api test:integration -- shop-suspension
```

Attendu : ÉCHEC de compilation, les deux fonctions n'existent pas.

- [ ] **Step 3: Écrire les deux fonctions**

Dans `packages/db/src/repositories/vendor.repository.ts`, après `setShopPaymentMethods` :

```ts
// Les boutiques FERMÉES sont exclues : une boutique fermée n'est pas une boutique qu'on
// administre, c'est la même règle que `readVendorForMember`.
export async function listShopsForAdministration(prisma: PrismaClient) {
    return prisma.vendor.findMany({
        where: { deletedAt: null },
        orderBy: { shopName: "asc" },
        select: {
            id: true,
            slug: true,
            shopName: true,
            suspendedAt: true,
            suspendedBy: { select: { name: true } },
        },
    });
}

// Les deux colonnes se posent et se retirent ENSEMBLE : une date sans auteur, ou un auteur
// sans date, serait un état que rien ne sait lire.
//
// Aucune garde de concurrence, contrairement à `setOrderStatus` : deux administrateurs qui
// suspendent la même boutique écrivent la même chose, et l'un qui suspend pendant que
// l'autre rétablit laisse le dernier écrit gagner. Les deux issues sont cohérentes et se
// corrigent d'un clic.
export async function setShopSuspension(
    prisma: PrismaClient,
    input: { vendorId: string; administratorId: string; suspended: boolean },
): Promise<void> {
    await prisma.vendor.updateMany({
        // `suspendedAt: null` quand on suspend : une boutique déjà suspendue garde la date
        // de sa PREMIÈRE suspension, qui est celle que l'administration a besoin de lire.
        where: input.suspended
            ? { id: input.vendorId, suspendedAt: null }
            : { id: input.vendorId },
        data: input.suspended
            ? { suspendedAt: new Date(), suspendedById: input.administratorId }
            : { suspendedAt: null, suspendedById: null },
    });
}
```

L'exporter depuis `packages/db/src/repositories/index.ts` si le barillet ne fait pas
`export *` sur ce fichier.

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

```bash
pnpm --filter @clemperl/db exec tsc -p tsconfig.build.json
pnpm --filter @clemperl/api test:integration -- shop-suspension
```

Attendu : PASSE.

- [ ] **Step 5: Vérifier la tâche**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @clemperl/api test:integration
```

---

## Task 4: L'écran d'administration

**Files:**
- Create: `apps/admin/src/app/shops/page.tsx`
- Create: `apps/admin/src/app/shops/actions.ts`
- Create: `apps/admin/src/app/shops/suspension-form.tsx`
- Create: `apps/admin/src/app/shops/types/suspension-state.interface.ts`
- Modify: `apps/admin/src/app/layout.tsx`
- Modify: `packages/i18n/messages/admin/fr.json`

**Interfaces:**
- Consumes: `listShopsForAdministration` et `setShopSuspension` de la tâche 3.
- Produces: rien que d'autres tâches consomment.

- [ ] **Step 1: Lire le guide Next et l'écran à imiter**

`apps/admin/AGENTS.md` l'exige : lire dans `node_modules/next/dist/docs/` ce qui concerne les
server actions avant d'écrire. Puis lire `apps/admin/src/app/applications/page.tsx`, dont
cette page reprend la forme, et `apps/admin/src/app/applications/[id]/actions.ts`, dont
l'action reprend la garde.

- [ ] **Step 2: Écrire le type de l'état**

`types/suspension-state.interface.ts`. Il vit à part de `actions.ts` pour une raison que le
dépôt a déjà payée : un fichier `"use server"` n'exporte que des fonctions asynchrones, et
une constante qu'on y exporte quand même arrive `undefined` au client, avec une erreur qui
parle d'autre chose.

```ts
export interface ISuspensionState {
    message: string[];
}

export const INITIAL_STATE: ISuspensionState = { message: [] };
```

- [ ] **Step 3: Écrire l'action**

`actions.ts`, sur la forme de `applications/[id]/actions.ts` :

```ts
"use server";

import { prisma, setShopSuspension } from "@clemperl/db";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../lib/session";
import type { ISuspensionState } from "./types/suspension-state.interface";

export async function toggleSuspension(
    _previous: ISuspensionState,
    form: FormData,
): Promise<ISuspensionState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page qui
    // l'a rendue ne la protège pas. C'est aussi d'ici que vient l'identité de celui qui
    // suspend, jamais d'un champ du formulaire.
    const session = await requireAdministrator();

    const vendorId = String(form.get("vendorId") ?? "");
    const suspended = form.get("suspended") === "1";
    if (vendorId === "") {
        return { message: [messages.errors.failed] };
    }

    try {
        await setShopSuspension(prisma, {
            vendorId,
            administratorId: session.user.id,
            suspended,
        });
    } catch (error) {
        console.error("toggleSuspension", error);
        return { message: [messages.errors.failed] };
    }

    // `/shops` est une route statique : le chemin littéral suffit. Ce ne serait pas le cas
    // d'un segment dynamique, qui exige le MOTIF.
    revalidatePath("/shops");
    return { message: [] };
}
```

- [ ] **Step 4: Écrire le bouton**

`suspension-form.tsx`, composant client, un formulaire par ligne avec son propre
`useActionState`. Deux champs cachés, `vendorId` et `suspended`, et un bouton dont le libellé
vient des props. Le composant n'importe RIEN de `@clemperl/db`.

- [ ] **Step 5: Écrire la page**

`page.tsx`, sur la forme de `applications/page.tsx` : `force-dynamic`, `requireAdministrator`,
un `main` étroit, un titre, une liste bordée. Chaque ligne porte le nom de la boutique, son
slug, son état, et pour une boutique suspendue la date et le nom de qui l'a posée, ou rien
si le compte a disparu.

Formater la date avec `Intl.DateTimeFormat("fr", { dateStyle: "long" })`, comme la page des
candidatures.

Porter `data-testid="boutique"` sur chaque ligne : la suite bout en bout en a besoin, et
viser par rôle ne distingue pas deux lignes.

- [ ] **Step 6: Ajouter le lien de navigation**

Dans `apps/admin/src/app/layout.tsx`, à côté du lien vers `/applications`, un lien vers
`/shops` dont le libellé vient de `messages.navigation`.

- [ ] **Step 7: Écrire les libellés**

Dans `packages/i18n/messages/admin/fr.json`, un bloc `shops` :

```json
"shops": {
  "title": "Les boutiques",
  "empty": "Aucune boutique pour le moment.",
  "active": "Active",
  "suspended": "Suspendue",
  "suspendedSince": "Suspendue le {date}",
  "suspendedBy": "par {name}",
  "suspend": "Suspendre",
  "restore": "Rétablir"
}
```

Et une clé `navigation.shops`. Le front d'administration n'a PAS de catalogue anglais, et
cette tranche n'en crée pas.

- [ ] **Step 8: Vérifier la tâche**

```bash
pnpm lint && pnpm typecheck && pnpm build
```

Le `build` compte : un composant client qui tirerait `@clemperl/db` échoue à l'assemblage,
avec une erreur qui ne nomme aucun maillon.

Puis vérifier à la main contre la stack : ouvrir `/shops`, suspendre une boutique, constater
que la ligne change d'état et que la date et le nom apparaissent.

---

## Task 5: Le bandeau du vendeur

**Files:**
- Create: `apps/vendor/src/app/components/shop-offline.tsx`
- Modify: `apps/vendor/src/app/shop/page.tsx`, `apps/vendor/src/app/products/page.tsx`, `apps/vendor/src/app/orders/page.tsx`
- Modify: `packages/i18n/messages/vendor/fr.json`

**Interfaces:**
- Consumes: `Vendor.suspendedAt` de la tâche 1, rendu par `requireVendorMembership`.
- Produces: `<ShopOffline suspended={boolean} />`.

- [ ] **Step 1: Écrire le bandeau**

Composant SERVEUR, aucun `"use client"`. Il ne rend rien quand la boutique est active.

```tsx
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import type { JSX } from "react";

// Le bandeau est rendu par les pages et non par la mise en page : celle-ci est STATIQUE par
// décision, et un layout qui ne garde pas l'accès n'a rien à faire de données protégées.
export function ShopOffline({ suspended }: { suspended: boolean }): JSX.Element | null {
    if (!suspended) {
        return null;
    }
    return (
        <p role="status" className="border border-bordure bg-bordure/20 px-4 py-3 text-sm">
            {messages.shopOffline.message}
        </p>
    );
}
```

- [ ] **Step 2: Le poser sur les trois pages**

Dans `shop/page.tsx`, `products/page.tsx` et `orders/page.tsx`, en tête du `main` :

```tsx
<ShopOffline suspended={vendor.suspendedAt !== null} />
```

`requireVendorMembership` rend déjà `vendor` à chacune de ces pages.

Les trois sous-pages de création et d'édition ne le portent PAS : on y arrive depuis ces
trois-là, et on y repasse.

- [ ] **Step 3: Écrire le libellé**

Dans `packages/i18n/messages/vendor/fr.json` :

```json
"shopOffline": {
  "message": "Votre boutique n'apparaît pas au catalogue, et ses articles ne sont pas achetables. Vos commandes en cours restent à traiter normalement."
}
```

La phrase parle de la BOUTIQUE, jamais de la personne. Elle ne dit pas « vous êtes
suspendu ».

- [ ] **Step 4: Vérifier la tâche**

```bash
pnpm lint && pnpm typecheck && pnpm build
```

Puis à la main : suspendre une boutique depuis l'administration et constater le bandeau sur
les trois pages, ainsi que l'accès conservé à l'espace.

---

## Task 6: Bout en bout, pièges, passation

**Files:**
- Create: `e2e/shop-suspension.spec.ts`
- Modify: `docs/passation.md`, `docs/pieges.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1: Demander le créneau Testcontainers**

Avant de monter la stack e2e, demander aux autres sessions Claude de cette machine si l'une
d'elles exécute des suites à conteneurs. Deux réacteurs Ryuk concurrents font tomber
l'environnement de développement.

- [ ] **Step 2: Écrire le parcours**

`e2e/shop-suspension.spec.ts`, sur la forme de `e2e/payment.spec.ts`. Reprendre
`createApprovedVendorShop`, `acceptPaymentMethods` et `publishProduct` des aides, et
`signInAsAdministrator`.

Le parcours :

1. un vendeur ouvre sa boutique, coche une méthode, publie un article ;
2. un visiteur le voit au catalogue ;
3. un administrateur ouvre `/shops`, suspend cette boutique, et ATTEND que la ligne porte
   l'état suspendu ;
4. le visiteur recharge le catalogue : l'article a disparu ;
5. la fiche de l'article répond 404 ;
6. le vendeur ouvre son espace : il voit le bandeau, et il voit toujours ses produits ;
7. l'administrateur rétablit ;
8. l'article revient au catalogue.

**Attendre ce que l'ACTION a produit, jamais un mot que l'écran porte peut-être déjà.** Le
bouton s'appelle « Suspendre » et l'état « Suspendue » : la correspondance de Playwright est
une sous-chaîne insensible à la casse, donc viser l'état par une correspondance EXACTE, ou
par un rôle, jamais par `getByText("Suspendu")`.

- [ ] **Step 3: Lancer le parcours**

```bash
pnpm e2e:up
pnpm test:e2e -- shop-suspension.spec.ts
```

En cas d'échec, séparer la charge du défaut : rejouer le test seul avant de conclure. Si des
routes répondent 500 sur une résolution de module, le cache `.next` est corrompu et seul
`--force-recreate` le répare.

- [ ] **Step 4: Lancer la suite entière**

```bash
pnpm test:e2e --workers=1
```

Attendu : vert. Cette machine sature à deux workers ; un worker est le banc qui tranche ici,
et la CI est celui qui tranche pour de bon.

- [ ] **Step 5: Consigner les pièges payés**

Dans `docs/pieges.md`, n'ajouter que ce qui a RÉELLEMENT coûté pendant cette tranche. La
règle d'admission du fichier est stricte : un registre qui accueille des suppositions cesse
d'être un registre. Si rien n'a coûté, n'ajouter rien et le dire.

- [ ] **Step 6: Mettre la passation à jour**

Dans `docs/passation.md` : passer T5 à **Livrée**, écrire une section datée, et y porter au
moins :

- la suspension n'est PAS `deletedAt`, et pourquoi les deux se ressemblent sans faire la même
  chose ;
- ce que la suspension ne touche pas, et le test qui le tient ;
- le MVP part sans aucune notion de quota, et les quotas se poseront sur la même colonne s'ils
  servent ;
- aucun montant, aucune devise, aucune échéance : le prix vit hors de la plateforme parce
  qu'il dépend de qui la déploie ;
- rétablir efface la trace de la suspension précédente, il n'y a pas de journal des
  mouvements ;
- un compte peut être membre de plusieurs boutiques et l'interface n'en montre qu'une,
  limite préexistante que T5 rend un peu plus visible ;
- les décomptes de tests, mesurés et non recopiés.

- [ ] **Step 7: Vérifier le chantier en entier**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @clemperl/api test:integration
pnpm test:e2e --workers=1
```

Si une couche ne peut pas tourner, le DIRE, et ne pas annoncer un chantier vérifié sur la foi
des autres.

- [ ] **Step 8: Donner la commande de commit**

Ne PAS commiter. Donner la commande exacte, fichiers nommés, message court en anglais. La
spec et ce plan y voyagent.
