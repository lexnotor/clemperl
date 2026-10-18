# T6c, surveiller les commandes et débloquer : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal :** l'administration voit les commandes de toutes les boutiques, les filtre et les
pagine, et peut faire avancer celle qu'un vendeur laisse dormir.

**Architecture :** aucun modèle neuf. Le corps de l'écriture d'état descend dans une aide
privée qui porte une portée de boutique optionnelle ; deux fonctions exportées la
surplombent, celle du vendeur gardant son `vendorId` obligatoire. Une lecture paginée
s'ajoute au dépôt des commandes, et un écran d'administration sur la forme des trois qui
existent déjà.

**Tech Stack :** Prisma 7.10 et PostgreSQL 17, Next.js 16 en server actions, Jest pour
l'intégration dans `apps/api`, Vitest pour les tests unitaires de l'administration,
Playwright pour le navigateur.

**Spec :** `docs/superpowers/specs/2026-10-18-t6c-surveillance-commandes-design.md`

## Global Constraints

- Identifiants, noms de fichiers, segments d'URL et clés de traduction en **anglais** ;
  documentation, commentaires et libellés en **français**.
- Aucun tiret cadratin ni demi-cadratin nulle part, code et prose compris.
- Indentation : **4 espaces** en TypeScript, **2 espaces** dans les JSON, y compris
  `packages/i18n/messages/admin/fr.json`.
- **Aucune configuration Prettier** dans ce dépôt : ne pas le lancer.
- Un commentaire est au présent et ne cite **jamais** un numéro de tâche, de spec ou de
  section. Les annotations « Review Focus » de ce plan sont des notes au constructeur, pas
  du texte à recopier.
- Ni nom de branche ni sha de commit dans un message de commit ou un document durable. Une
  PR se cite par son numéro.
- Assertions de refus : `rejects.toMatchObject({ message: CONST })`, **jamais** `toThrow`,
  qui compare par sous-chaîne.
- `packages/db` ne doit jamais importer `packages/domain` : le cycle casse `turbo`. Le
  dépôt reçoit des primitives, et c'est l'appelant qui fait décider le domaine.
- Aucun prix ne se formate dans un composant client : `formatPrice` tire `@clemperl/core`,
  donc nodemailer, donc `node:net`, et le paquet navigateur cesse de s'assembler.
- Un état ne s'affiche jamais par la valeur de son énumération : il passe par une clé du
  catalogue. « PLACED » n'est pas du français.
- `revalidatePath` suit la structure de fichiers : dans l'administration, `/orders` sans
  segment de locale.
- Chaque server action rappelle sa garde : une action est une route publique.
- Une action qu'un rôle ne peut pas exercer n'est pas rendue grisée, elle n'est pas rendue.
- Les seuils de couverture de `packages/domain` et `packages/db` hors `src/repositories/**`
  restent à 100 %. Cette tranche n'ajoute rien à `packages/domain`.

## Review Focus

Les cinq entrées que la spec implique sans qu'aucune tâche ne les éprouve d'elle-même. La
ligne dit l'entrée et ce qu'une personne raisonnable attend ; le test qui la fixe est ajouté
à la tâche qui porte le code.

1. **Une action inventée, postée à la main.** `constructor` sur un objet littéral rend une
   fonction et non `undefined`, que le domaine prendrait pour un état valide. L'action doit
   refuser. Test en tâche 4.
2. **Un `orderId` inventé ou absent.** L'action doit refuser nommément plutôt que rendre un
   succès sur zéro ligne touchée. Test en tâche 4.
3. **Un `page` hors bornes dans l'URL**, négatif, énorme ou non numérique. Prisma lève sur
   un `skip` négatif, et une page au-delà du total doit rendre une liste vide plutôt
   qu'une erreur. Test en tâche 3.
4. **Un filtre d'état inventé dans l'URL**, `?status=BANANA`. Il ne doit ni lever ni être
   ignoré en silence au point de rendre toutes les commandes comme si aucun filtre n'était
   demandé. Test en tâche 3.
5. **Deux commandes au même horodatage, de part et d'autre d'une frontière de page.** Sans
   l'ordre clos sur l'identifiant, l'une se répète et l'autre disparaît. Test en tâche 2.

---

### Task 1 : écrire un état sans appartenance à une boutique

**Files:**
- Modify : `packages/db/src/repositories/order.repository.ts`
- Test : `apps/api/test/order-oversight.int-spec.ts` (créé ici)

**Interfaces:**
- Consumes : rien.
- Produces :
  - `setOrderStatusAsAdministrator(prisma, input: { orderId: string; from: string; status: string }): Promise<void>`
  - `setOrderStatus` garde exactement sa signature actuelle, `vendorId` obligatoire.
  - Les deux lèvent `ERROR_ORDER_NOT_FOUND` ou `ERROR_ORDER_STATUS_STALE`, déjà exportées.

L'aide privée est la seule à porter la portée optionnelle, et elle n'est pas exportée. Une
portée optionnelle dans une signature publique ferait de la garde d'appartenance un
paramètre qu'on omet sans qu'aucun type ne proteste.

- [ ] **Step 1 : écrire les tests d'intégration**

Créer `apps/api/test/order-oversight.int-spec.ts`, `PREFIX` vaut `"over"`. Reprendre la
forme des aides de `apps/api/test/accounts.int-spec.ts` pour la boutique, et de
`apps/api/test/shop-suspension.int-spec.ts` pour le produit et la commande.

```ts
describe("écrire un état de commande sans boutique", () => {
    it("fait avancer une commande sans portée de boutique", async () => {
        const { orderId } = await placedOrder();

        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: "PLACED",
            status: "ACCEPTED",
        });

        const apres = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        expect(apres.status).toBe("ACCEPTED");
    });

    // La comparaison-et-échange vaut des deux côtés : l'administration ne doit pas pouvoir
    // ramener en arrière une commande qu'un vendeur vient de faire avancer.
    it("refuse quand l'état lu a changé", async () => {
        const { orderId } = await placedOrder();
        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: "PLACED",
            status: "ACCEPTED",
        });

        await expect(
            setOrderStatusAsAdministrator(prisma, {
                orderId,
                from: "PLACED",
                status: "CANCELLED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_STATUS_STALE });
    });

    it("refuse une commande qui n'existe pas", async () => {
        await expect(
            setOrderStatusAsAdministrator(prisma, {
                orderId: "c00000000000000000000000",
                from: "PLACED",
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });
    });

    // LA régression à empêcher. Le chemin vendeur doit rester exactement aussi fermé
    // qu'avant : une commande d'une autre boutique lui est introuvable, et aucun appel ne
    // doit pouvoir omettre la portée.
    it("laisse le chemin vendeur refuser la commande d'une autre boutique", async () => {
        const { orderId } = await placedOrder();
        const autre = await createShop();

        await expect(
            setOrderStatus(prisma, {
                vendorId: autre.id,
                orderId,
                from: "PLACED",
                status: "ACCEPTED",
            }),
        ).rejects.toMatchObject({ message: ERROR_ORDER_NOT_FOUND });
    });
});
```

- [ ] **Step 2 : lancer les tests et vérifier qu'ils échouent**

Run : `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand order-oversight"`
Attendu : FAIL, `setOrderStatusAsAdministrator is not a function`.

- [ ] **Step 3 : extraire l'aide privée et poser les deux entrées**

Dans `packages/db/src/repositories/order.repository.ts`, remplacer le corps de
`setOrderStatus` par ceci, en gardant ses commentaires existants sur la portée et sur `from`
aux endroits qui leur correspondent :

```ts
// La portée de boutique est optionnelle ICI et nulle part ailleurs. Les deux fonctions
// exportées plus bas sont les seules entrées, et celle du vendeur exige un `vendorId` que
// son appelant ne peut pas omettre. Porter cette option dans une signature publique ferait
// de la garde d'appartenance un paramètre qu'on oublie sans que rien ne proteste.
async function writeOrderStatus(
    prisma: PrismaClient,
    input: { vendorId?: string; orderId: string; from: string; status: string },
): Promise<void> {
    const scope = input.vendorId === undefined ? {} : { vendorId: input.vendorId };

    // `from` dans le `where`, et c'est le coeur de cette fonction. L'appelant a LU un état
    // puis calculé la transition : sans cette condition, l'écriture écrase une décision
    // plus récente. Ne pas la retirer.
    //
    // Deux écrans peuvent regarder la même commande, deux membres d'une boutique comme un
    // vendeur et un administrateur. Celui qui clique sur un écran périmé ramènerait une
    // commande expédiée à « acceptée », et un `count === 0` sans condition de statut ne
    // verrait rien.
    const change = await prisma.order.updateMany({
        where: { id: input.orderId, ...scope, status: input.from as never },
        data: { status: input.status as never },
    });

    if (change.count === 0) {
        // On distingue les deux refus : une commande hors de portée est introuvable, une
        // commande qui a bougé demande à l'écran de se recharger. Les confondre ferait lire
        // « commande introuvable » à quelqu'un qui regarde la sienne.
        const exists = await prisma.order.findFirst({
            where: { id: input.orderId, ...scope },
            select: { id: true },
        });
        throw new Error(exists ? ERROR_ORDER_STATUS_STALE : ERROR_ORDER_NOT_FOUND);
    }
}

// Le filtre par boutique vit dans la SIGNATURE, pas dans une vérification d'appelant :
// `orderId` vient de l'URL, donc du client.
//
// La transition elle-même est décidée par le domaine, qui ne peut pas être importé ici.
// L'appelant la calcule et passe l'état visé ; ce dépôt vérifie seulement l'appartenance.
export async function setOrderStatus(
    prisma: PrismaClient,
    input: { vendorId: string; orderId: string; from: string; status: string },
): Promise<void> {
    return writeOrderStatus(prisma, input);
}

// L'administration n'appartient à aucune boutique, et c'est tout ce qui la distingue ici :
// elle emprunte les mêmes transitions, sous la même comparaison-et-échange. Le nom dit qui
// a le droit d'appeler, parce que la signature ne peut plus le dire.
export async function setOrderStatusAsAdministrator(
    prisma: PrismaClient,
    input: { orderId: string; from: string; status: string },
): Promise<void> {
    return writeOrderStatus(prisma, input);
}
```

- [ ] **Step 4 : lancer les tests et vérifier qu'ils passent**

Run : `docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build"` puis
`docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand order-oversight"`
Attendu : PASS, quatre tests.

Le build du paquet n'est pas facultatif : la suite d'intégration consomme `@clemperl/db`
par `dist/src/`, et une modification restée dans la source n'atteint pas le code exécuté.

- [ ] **Step 5 : prouver que la garde vendeur porte, par mutation**

Retirer `...scope` du `where` du `updateMany`, rebâtir, relancer.
Attendu : « laisse le chemin vendeur refuser la commande d'une autre boutique » rougit.
**Vérifier que la mutation a atteint `dist/src/` avant de lire le résultat**, par un `grep` :
une mutation restée dans la source rend un faux négatif qui ressemble à un succès.
Restaurer, rebâtir, constater que les quatre repassent.

- [ ] **Step 6 : lancer toute la couche**

Run : `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"`
Attendu : toutes les suites au vert. Le chemin vendeur est exercé par les suites de T3 et
T4, qui sont la vraie preuve que le refactor n'a rien cassé.

- [ ] **Step 7 : commit**

```bash
git add packages/db/src/repositories/order.repository.ts apps/api/test/order-oversight.int-spec.ts
git commit -m "Let an administrator advance an order without owning the shop"
```

---

### Task 2 : lire les commandes de toutes les boutiques

**Files:**
- Modify : `packages/db/src/repositories/order.repository.ts`
- Test : `apps/api/test/order-oversight.int-spec.ts`

**Interfaces:**
- Consumes : rien de la tâche 1 ; même fichier, fonctions indépendantes.
- Produces :
  ```ts
  export async function listOrdersForAdministration(
      prisma: PrismaClient,
      input: { status?: string; vendorId?: string; skip: number; take: number },
  ): Promise<{
      rows: {
          id: string; reference: string; status: string; currency: string;
          totalAmount: number; paymentStatus: string; createdAt: Date;
          shipToName: string; shopName: string; shopSlug: string;
      }[];
      total: number;
  }>;

  export async function readOrderForAdministration(
      prisma: PrismaClient,
      orderId: string,
  ): Promise<{
      id: string; reference: string; status: string; currency: string;
      totalAmount: number; paymentStatus: string; createdAt: Date;
      shipToName: string; shopName: string; shopSlug: string;
  } | null>;
  ```

`status` et `vendorId` sont des chaînes et non des types du domaine : ce dépôt ne reçoit que
des primitives, `packages/domain` dépendant déjà de lui.

- [ ] **Step 1 : écrire les tests d'intégration**

Ajouter à `apps/api/test/order-oversight.int-spec.ts` :

```ts
describe("lire les commandes de toutes les boutiques", () => {
    it("rend les commandes de boutiques différentes, et dit le total", async () => {
        const a = await placedOrder();
        const b = await placedOrder();

        const { rows, total } = await listOrdersForAdministration(prisma, {
            skip: 0,
            take: 100,
        });

        expect(rows.map((l) => l.id)).toEqual(expect.arrayContaining([a.orderId, b.orderId]));
        expect(total).toBeGreaterThanOrEqual(2);
    });

    it("porte le nom de la boutique et son slug", async () => {
        const { orderId, shop } = await placedOrder();

        const ligne = (
            await listOrdersForAdministration(prisma, { skip: 0, take: 100 })
        ).rows.find((l) => l.id === orderId);

        expect(ligne?.shopName).toBe(shop.shopName);
        expect(ligne?.shopSlug).toBe(shop.slug);
    });

    it("filtre par état", async () => {
        const { orderId } = await placedOrder();
        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: "PLACED",
            status: "CANCELLED",
        });

        const { rows } = await listOrdersForAdministration(prisma, {
            status: "PLACED",
            skip: 0,
            take: 100,
        });

        expect(rows.find((l) => l.id === orderId)).toBeUndefined();
    });

    it("filtre par boutique", async () => {
        const mienne = await placedOrder();
        const autre = await placedOrder();

        const { rows } = await listOrdersForAdministration(prisma, {
            vendorId: mienne.shop.id,
            skip: 0,
            take: 100,
        });

        expect(rows.find((l) => l.id === mienne.orderId)).toBeDefined();
        expect(rows.find((l) => l.id === autre.orderId)).toBeUndefined();
    });

    // Review Focus nº5. LE test qui justifie l'ordre clos sur l'identifiant. Trois
    // commandes au même horodatage, lues page par page : sans `id` final, PostgreSQL est
    // libre de les rendre dans un ordre différent à chaque requête, donc une ligne se
    // répète d'une page à l'autre et une autre disparaît sans que rien ne le signale.
    it("pagine sans sauter ni répéter quand les horodatages sont identiques", async () => {
        const quand = new Date();
        const faites = [await placedOrder(), await placedOrder(), await placedOrder()];
        const miennes = faites.map((f) => f.orderId);
        await prisma.order.updateMany({
            where: { id: { in: miennes } },
            data: { createdAt: quand },
        });

        const vues: string[] = [];
        for (let skip = 0; skip < 60; skip += 2) {
            const { rows } = await listOrdersForAdministration(prisma, { skip, take: 2 });
            if (rows.length === 0) break;
            vues.push(...rows.map((l) => l.id));
        }

        const miennesVues = vues.filter((id) => miennes.includes(id));
        expect(new Set(miennesVues).size).toBe(3);
        expect(miennesVues).toHaveLength(3);
    });

    // La suspension retire la boutique du catalogue, elle n'efface pas les engagements
    // pris avant. Une commande d'une boutique suspendue reste donc visible, et l'écran
    // d'administration doit pouvoir la débloquer comme une autre.
    it("rend aussi les commandes d'une boutique suspendue", async () => {
        const { orderId, shop } = await placedOrder();
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { suspendedAt: new Date() },
        });

        const { rows } = await listOrdersForAdministration(prisma, { skip: 0, take: 100 });

        expect(rows.find((l) => l.id === orderId)).toBeDefined();
    });

    it("rend une page vide au-delà du total, sans lever", async () => {
        await expect(
            listOrdersForAdministration(prisma, { skip: 100_000, take: 20 }),
        ).resolves.toMatchObject({ rows: [] });
    });

    it("lit une commande par son identifiant, sans boutique", async () => {
        const { orderId, shop } = await placedOrder();

        const commande = await readOrderForAdministration(prisma, orderId);

        expect(commande?.shopSlug).toBe(shop.slug);
    });

    it("rend null pour une commande qui n'existe pas", async () => {
        await expect(
            readOrderForAdministration(prisma, "c00000000000000000000000"),
        ).resolves.toBeNull();
    });
});
```

- [ ] **Step 2 : lancer les tests et vérifier qu'ils échouent**

Run : `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand order-oversight"`
Attendu : FAIL, `listOrdersForAdministration is not a function`.

- [ ] **Step 3 : écrire les deux lectures**

```ts
// Le tri se CLÔT sur l'identifiant, et ce n'est pas décoratif. Sans colonne finale unique,
// `LIMIT ... OFFSET` n'est pas déterministe dès que deux lignes partagent la valeur triée :
// une ligne se répète d'une page à l'autre et une autre est sautée, invisible et
// silencieuse. Deux commandes passées dans la même seconde suffisent. Même raison que le
// tri du catalogue.
//
// Le compte et la page partent dans la MÊME transaction : lus séparément, une commande
// créée entre les deux donnerait un total qui ne correspond pas aux lignes rendues, et la
// dernière page annoncerait une ligne qu'elle ne montre pas.
export async function listOrdersForAdministration(
    prisma: PrismaClient,
    input: { status?: string; vendorId?: string; skip: number; take: number },
) {
    const where = {
        ...(input.status === undefined ? {} : { status: input.status as never }),
        ...(input.vendorId === undefined ? {} : { vendorId: input.vendorId }),
    };

    const [rows, total] = await prisma.$transaction([
        prisma.order.findMany({
            where,
            orderBy: [{ createdAt: "desc" as const }, { id: "asc" as const }],
            skip: input.skip,
            take: input.take,
            select: ADMINISTRATION_ORDER,
        }),
        prisma.order.count({ where }),
    ]);

    return { rows: rows.map(flattenAdministrationOrder), total };
}

export async function readOrderForAdministration(prisma: PrismaClient, orderId: string) {
    const row = await prisma.order.findUnique({
        where: { id: orderId },
        select: ADMINISTRATION_ORDER,
    });
    return row === null ? null : flattenAdministrationOrder(row);
}
```

Au-dessus des deux, la sélection partagée et l'aplatissement :

```ts
// La boutique arrive imbriquée et repart à plat : l'écran lit une ligne, pas un arbre.
const ADMINISTRATION_ORDER = {
    id: true,
    reference: true,
    status: true,
    currency: true,
    totalAmount: true,
    paymentStatus: true,
    createdAt: true,
    shipToName: true,
    vendor: { select: { shopName: true, slug: true } },
} as const;

function flattenAdministrationOrder(row: {
    id: string;
    reference: string;
    status: string;
    currency: string;
    totalAmount: number;
    paymentStatus: string;
    createdAt: Date;
    shipToName: string;
    vendor: { shopName: string; slug: string };
}) {
    const { vendor, ...reste } = row;
    return { ...reste, shopName: vendor.shopName, shopSlug: vendor.slug };
}
```

- [ ] **Step 4 : lancer les tests et vérifier qu'ils passent**

Run : `docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build"` puis
`docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand order-oversight"`
Attendu : PASS, treize tests.

- [ ] **Step 5 : prouver que l'ordre clos porte, par mutation**

Retirer `{ id: "asc" }` de l'`orderBy`, rebâtir, relancer dix fois le seul test de
pagination.
Attendu, et c'est à ÉCRIRE tel qu'observé : PostgreSQL n'est pas tenu de changer son ordre,
donc ce test peut rester vert sans l'identifiant. S'il reste vert, le dire plutôt que
prétendre une preuve, et noter que la propriété est gardée pour le jour où le volume ou le
plan de requête changent. Vérifier la mutation dans `dist/src/` avant de conclure.
Restaurer et rebâtir.

- [ ] **Step 6 : commit**

```bash
git add packages/db/src/repositories/order.repository.ts apps/api/test/order-oversight.int-spec.ts
git commit -m "Read every shop's orders, paginated on a deterministic order"
```

---

### Task 3 : la liste dans l'administration

**Files:**
- Create : `apps/admin/src/app/orders/search-params.ts`
- Create : `apps/admin/src/app/orders/search-params.spec.ts`
- Create : `apps/admin/src/app/orders/page.tsx`
- Create : `apps/admin/src/app/orders/order-filters.tsx`
- Modify : `apps/admin/src/app/layout.tsx`
- Modify : `packages/i18n/messages/admin/fr.json`

**Interfaces:**
- Consumes : `listOrdersForAdministration` de la tâche 2 ; `listShopsForAdministration`,
  déjà exportée et utilisée par `/shops` ; `requireAdministrator` de
  `apps/admin/src/lib/session`.
- Produces : la page `/orders`. Aucune fonction consommée par une tâche suivante.

- [ ] **Step 1 : poser les libellés**

Dans `packages/i18n/messages/admin/fr.json`, à la main, en indentation deux espaces, une
section `orders` après `accounts` :

```json
"orders": {
  "title": "Les commandes",
  "empty": "Aucune commande.",
  "allShops": "Toutes les boutiques",
  "allStatuses": "Tous les états",
  "shopFilter": "Boutique",
  "statusFilter": "État",
  "apply": "Filtrer",
  "previous": "Précédentes",
  "next": "Suivantes",
  "counted": "{count} commandes",
  "status": {
    "PLACED": "Reçue",
    "ACCEPTED": "Acceptée",
    "SHIPPED": "Expédiée",
    "CANCELLED": "Annulée"
  },
  "payment": {
    "title": "Paiement",
    "status": {
      "PENDING": "En attente",
      "SETTLED": "Reçu",
      "FAILED": "Refusé"
    }
  }
}
```

Les libellés d'état sont **recopiés tels quels** du catalogue vendeur. Un administrateur et
un vendeur qui parlent de la même commande au téléphone doivent dire le même mot, et une
divergence de vocabulaire coûterait plus qu'un mot mieux choisi. Le piège que le vendeur a
déjà payé vaut ici : « Reçue » la commande et « Reçu » l'argent se confondent, d'où le mot
« Paiement » maintenu devant le second.

- [ ] **Step 2 : écrire le composant de filtres**

`order-filters.tsx`, composant CLIENT, deux `select` et un bouton dans un formulaire en
`GET` : les filtres vivent dans l'URL, donc une page filtrée se partage et se recharge.

```tsx
"use client";

import { Button } from "@clemperl/ui";
import type { JSX } from "react";

interface OrderFiltersProps {
    shops: { id: string; shopName: string }[];
    statuses: { value: string; label: string }[];
    selectedShop: string;
    selectedStatus: string;
    labels: {
        shopFilter: string;
        statusFilter: string;
        allShops: string;
        allStatuses: string;
        apply: string;
    };
}

export function OrderFilters(props: OrderFiltersProps): JSX.Element {
    return (
        <form method="GET" className="mt-8 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
                {props.labels.statusFilter}
                <select
                    name="status"
                    defaultValue={props.selectedStatus}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    <option value="">{props.labels.allStatuses}</option>
                    {props.statuses.map((etat) => (
                        <option key={etat.value} value={etat.value}>
                            {etat.label}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
                {props.labels.shopFilter}
                <select
                    name="shop"
                    defaultValue={props.selectedShop}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    <option value="">{props.labels.allShops}</option>
                    {props.shops.map((boutique) => (
                        <option key={boutique.id} value={boutique.id}>
                            {boutique.shopName}
                        </option>
                    ))}
                </select>
            </label>
            <Button type="submit">{props.labels.apply}</Button>
        </form>
    );
}
```

Les états arrivent en PROPS depuis le serveur, pas par un import du domaine : le paquet
navigateur ne doit pas tirer `@clemperl/core`.

- [ ] **Step 3 : écrire le test des deux lectures d'URL, puis le module**

Tout ce que la page reçoit vient de l'URL, donc du client. Ces deux lectures vivent dans
leur propre module plutôt que dans `page.tsx` pour une raison simple : une fonction dans un
composant serveur ne s'éprouve pas, et ce sont elles qui portent les deux entrées les plus
susceptibles de casser l'écran.

Écrire `search-params.spec.ts` D'ABORD, et le voir rougir :

```ts
import { describe, expect, it } from "vitest";
import { pageFrom, statusFrom } from "./search-params.js";

describe("lire les paramètres d'URL de la liste des commandes", () => {
    // Un `skip` négatif fait LEVER Prisma, et une page non numérique rend `NaN`, que
    // `skip` propagerait jusqu'à la requête.
    it("ramène tout numéro de page impossible à la première", () => {
        for (const brut of [undefined, "", "0", "-3", "abc", "1e9999", "NaN", " "]) {
            expect(pageFrom(brut)).toBe(1);
        }
    });

    it("garde un numéro de page légitime", () => {
        expect(pageFrom("1")).toBe(1);
        expect(pageFrom("7")).toBe(7);
    });

    // Un état inventé ne doit pas atteindre le dépôt. Il est traité comme aucun filtre,
    // ce qui rend la liste complète : c'est la seule issue honnête, puisque l'écran ne
    // peut pas filtrer sur une valeur que l'énumération ne connaît pas.
    it("ignore un état hors vocabulaire, `constructor` compris", () => {
        for (const brut of [undefined, "", "BANANA", "constructor", "toString", "placed"]) {
            expect(statusFrom(brut)).toBeUndefined();
        }
    });

    it("garde les quatre états réels", () => {
        for (const etat of ["PLACED", "ACCEPTED", "SHIPPED", "CANCELLED"]) {
            expect(statusFrom(etat)).toBe(etat);
        }
    });
});
```

Run : `pnpm --filter @clemperl/admin test`
Attendu : FAIL, le module `./search-params.js` n'existe pas.

Puis l'écrire :

```ts
import { E_ORDER_STATUS } from "@clemperl/db/enums";

/** La première page, dès que ce qui arrive de l'URL n'est pas un numéro utilisable. */
export function pageFrom(raw: string | undefined): number {
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/**
 * L'état demandé, ou rien s'il n'est pas du vocabulaire.
 *
 * Par `Object.hasOwn` et non par un accès direct : `E_ORDER_STATUS` est un objet, et un
 * état nommé `constructor` y rendrait une fonction là où l'on attend `undefined`. Le
 * piège est le même que celui que l'action vendeur paie sur les actions.
 */
export function statusFrom(raw: string | undefined): string | undefined {
    return raw !== undefined && Object.hasOwn(E_ORDER_STATUS, raw) ? raw : undefined;
}
```

L'import vient de `@clemperl/db/enums`, le sous-chemin sans client Prisma.

Run : `pnpm --filter @clemperl/admin test`
Attendu : PASS.

- [ ] **Step 4 : écrire la page**

`page.tsx`, composant serveur, sur la forme de `apps/admin/src/app/moderation/page.tsx`,
avec `const PAGE_SIZE = 20;`.

La page lit `searchParams`, construit `skip` depuis `pageFrom`, appelle
`listOrdersForAdministration` et `listShopsForAdministration`, et rend une ligne par
commande avec sa référence, son total formaté **côté serveur** par `formatPrice`, le nom de
la boutique suivi de son slug, le destinataire, l'état et l'état de paiement par leurs clés,
et la date. Chaque ligne est un lien vers `/orders/<id>`.

Le slug à côté du nom pour la raison que la revue de la suspension a établie : `shopName`
n'est pas unique, et deux lignes indistinguables feraient agir sur la commande de quelqu'un
d'autre.

Sous la liste, deux liens « Précédentes » et « Suivantes » qui conservent les filtres
courants et ne sont rendus que s'il y a une page de ce côté. Un lien qui ne mène nulle part
n'est pas rendu désactivé, il n'est pas rendu.

```tsx
export const dynamic = "force-dynamic";
```

- [ ] **Step 5 : ajouter le lien de navigation**

Dans `apps/admin/src/app/layout.tsx`, « Commandes » vers `/orders`, dans la `nav` après
« Administrateurs ». Sans ce lien l'écran est inatteignable.

- [ ] **Step 6 : vérifier à la main, dans un navigateur**

La pile de développement est debout. Se connecter avec le compte d'administration, ouvrir
`http://localhost:3002/orders`, et OBSERVER, en le rapportant écran par écran :

- la liste porte des commandes de boutiques différentes ;
- filtrer par état réduit la liste, et l'URL porte le filtre ;
- `?page=0`, `?page=-3`, `?page=abc` et `?status=BANANA` rendent la première page sans
  erreur, et ne font pas disparaître le filtre d'état légitime ;
- la dernière page ne propose pas « Suivantes ».

- [ ] **Step 7 : lint, typecheck et commit**

Run : `pnpm lint` puis `pnpm typecheck`
Attendu : 15 sur 15 chacun.

```bash
git add apps/admin/src/app/orders apps/admin/src/app/layout.tsx packages/i18n/messages/admin/fr.json
git commit -m "List every shop's orders in the administration"
```

---

### Task 4 : le détail et l'action

**Files:**
- Create : `apps/admin/src/app/orders/[id]/page.tsx`
- Create : `apps/admin/src/app/orders/[id]/order-actions.tsx`
- Create : `apps/admin/src/app/orders/[id]/actions.ts`
- Create : `apps/admin/src/app/orders/[id]/types/order-action-state.interface.ts`
- Create : `apps/admin/src/app/orders/[id]/actions.spec.ts`
- Modify : `packages/i18n/messages/admin/fr.json`

**Interfaces:**
- Consumes : `readOrderForAdministration` et `setOrderStatusAsAdministrator` des tâches 1
  et 2 ; `advanceOrder`, `allowedOrderActions`, `E_ORDER_ACTION`,
  `ForbiddenOrderTransitionError` de `@clemperl/domain` ; `ERROR_ORDER_NOT_FOUND` et
  `ERROR_ORDER_STATUS_STALE` de `@clemperl/db`.
- Produces : une server action `advance`, de signature
  `(previous: IOrderActionState, form: FormData) => Promise<IOrderActionState>`.

`types/order-action-state.interface.ts` contient exactement :

```ts
export interface IOrderActionState {
    /** Vide quand l'action a abouti. L'écran n'affiche que ce qui n'est pas vide. */
    error: string;
}

export const INITIAL_STATE: IOrderActionState = { error: "" };
```

`INITIAL_STATE` vit dans ce fichier et pas dans `actions.ts` : un fichier `"use server"`
n'exporte que des fonctions asynchrones, et une constante qu'on y exporte arrive
`undefined` au client avec une erreur qui parle d'autre chose.

- [ ] **Step 1 : compléter les libellés**

Ajouter à la section `orders` du catalogue :

```json
  "backToList": "Toutes les commandes",
  "placedOn": "Passée le",
  "buyer": "Destinataire",
  "settledWarning": "Ce paiement est reçu. L'annuler ici ne le rembourse pas : un remboursement se fait entre le vendeur et son acheteur, par le canal de l'encaissement.",
  "action": {
    "ACCEPT": "Accepter",
    "SHIP": "Expédier",
    "CANCEL": "Annuler"
  }
```

et, dans la section `errors`, une sous-section `order` :

```json
  "order": {
    "not_found": "Cette commande n'existe plus.",
    "moved": "Cette commande a changé d'état pendant que vous regardiez la page. Rechargez-la.",
    "failed": "L'action n'a pas pu être enregistrée. Réessayez."
  }
```

- [ ] **Step 2 : écrire les tests unitaires de l'action**

`actions.spec.ts`, sur la forme de `apps/admin/src/app/accounts/actions.spec.ts`, qui mocke
les frontières et asserte les appels. Quatre cas, dont deux du Review Focus :

```ts
// Review Focus nº1. `E_ORDER_ACTION` est un objet littéral : `constructor` y rend une
// fonction et non `undefined`, que le domaine prendrait pour une action valide.
it("refuse une action inventée, y compris `constructor`", async () => {
    for (const invente of ["", "BANANA", "constructor", "toString"]) {
        const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: invente }));
        expect(state.error).toBe(messages.errors.order.failed);
    }
    expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
});

// Review Focus nº2. Un identifiant inventé ne doit pas rendre un succès silencieux.
it("refuse une commande qui n'existe pas", async () => {
    readOrderForAdministration.mockResolvedValue(null);

    const state = await advance(INITIAL_STATE, form({ orderId: "inventé", action: "ACCEPT" }));

    expect(state.error).toBe(messages.errors.order.not_found);
    expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
});

it("refuse une transition que l'état courant n'autorise pas", async () => {
    readOrderForAdministration.mockResolvedValue({ id: "o1", status: "SHIPPED" });

    const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

    expect(state.error).toBe(messages.errors.order.moved);
    expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
});

it("passe l'état LU comme `from`, et non celui qu'on vise", async () => {
    readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });

    await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

    expect(setOrderStatusAsAdministrator).toHaveBeenCalledWith(expect.anything(), {
        orderId: "o1",
        from: "PLACED",
        status: "ACCEPTED",
    });
});

// La matrice de T6b ne distingue pas les commandes : les deux niveaux d'administration
// passent la même garde, et rien ici ne justifie de l'étendre.
it("laisse passer les deux niveaux d'administration", async () => {
    readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });

    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
        requireAdministrator.mockResolvedValue({ user: { id: "u1", role } });
        const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));
        expect(state.error).toBe("");
    }
});

it("traduit le refus du dépôt quand la commande a bougé", async () => {
    readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });
    setOrderStatusAsAdministrator.mockRejectedValue(new Error(ERROR_ORDER_STATUS_STALE));

    const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

    expect(state.error).toBe(messages.errors.order.moved);
});
```

- [ ] **Step 3 : lancer les tests et vérifier qu'ils échouent**

Run : `pnpm --filter @clemperl/admin test`
Attendu : FAIL, le module `./actions` n'existe pas.

- [ ] **Step 4 : écrire l'action**

```ts
"use server";

import {
    ERROR_ORDER_NOT_FOUND,
    ERROR_ORDER_STATUS_STALE,
    prisma,
    readOrderForAdministration,
    setOrderStatusAsAdministrator,
} from "@clemperl/db";
import {
    advanceOrder,
    E_ORDER_ACTION,
    ForbiddenOrderTransitionError,
    type TOrderAction,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../../lib/session";
import type { IOrderActionState } from "./types/order-action-state.interface";

const ERRORS = messages.errors.order as Record<string, string>;

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le bouton ne la protège pas.
export async function advance(
    _previous: IOrderActionState,
    form: FormData,
): Promise<IOrderActionState> {
    await requireAdministrator();
    const orderId = String(form.get("orderId") ?? "");
    const submitted = String(form.get("action") ?? "");

    // Par `Object.hasOwn` et non par un accès direct : une action nommée `constructor`
    // rendrait une fonction au lieu de `undefined`, que le domaine prendrait pour valide.
    if (!Object.hasOwn(E_ORDER_ACTION, submitted)) {
        return { error: ERRORS["failed"] as string };
    }
    const action = submitted as TOrderAction;

    const order = await readOrderForAdministration(prisma, orderId);
    if (order === null) {
        return { error: ERRORS["not_found"] as string };
    }

    try {
        // Le DOMAINE décide de la transition, le dépôt ne fait qu'écrire.
        const next = advanceOrder(order.status as never, action);

        // L'état LU repart avec l'écriture : entre cette lecture et cette écriture, le
        // vendeur a pu faire avancer sa commande, et sans `from` on écraserait sa décision.
        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: order.status,
            status: next,
        });
    } catch (error) {
        if (error instanceof Error && error.message === ERROR_ORDER_NOT_FOUND) {
            return { error: ERRORS["not_found"] as string };
        }
        const moved =
            error instanceof ForbiddenOrderTransitionError ||
            (error instanceof Error && error.message === ERROR_ORDER_STATUS_STALE);
        if (moved) {
            return { error: ERRORS["moved"] as string };
        }
        console.error("advance", error);
        return { error: ERRORS["failed"] as string };
    }

    revalidatePath("/orders");
    revalidatePath("/orders/[id]", "page");
    return { error: "" };
}
```

- [ ] **Step 5 : écrire la page de détail et le composant d'actions**

`page.tsx` appelle `requireAdministrator()`, lit la commande par
`readOrderForAdministration`, et rend ses informations avec les prix formatés côté serveur.
Les boutons viennent d'`allowedOrderActions(order.status)`, et seuls ceux-là sont rendus.

L'avertissement sur un paiement reçu est calculé côté serveur et passé en prop :

```tsx
<OrderActions
    orderId={order.id}
    actions={allowedOrderActions(order.status as never).map((action) => ({
        value: action,
        label: t.action[action],
    }))}
    // L'avertissement ne s'affiche que s'il y a quelque chose à avertir : une annulation
    // possible ET un paiement déjà reçu. Le dire sur une commande impayée inquiéterait
    // pour rien.
    settledWarning={
        order.paymentStatus === "SETTLED" &&
        allowedOrderActions(order.status as never).includes("CANCEL")
            ? t.settledWarning
            : ""
    }
/>
```

`order-actions.tsx` est le composant client : un `useActionState` par formulaire, un bouton
par action, et l'avertissement rendu au-dessus du bouton d'annulation quand la prop n'est
pas vide. Le message d'erreur de l'état se rend en `role="alert"`.

- [ ] **Step 6 : lancer les tests et vérifier qu'ils passent**

Run : `pnpm --filter @clemperl/admin test`
Attendu : PASS, six tests.

- [ ] **Step 7 : vérifier à la main, dans un navigateur**

Ouvrir une commande en « Reçue » et OBSERVER : les boutons « Accepter » et « Annuler » sont
là, « Expédier » ne l'est pas. Accepter, puis constater que « Expédier » apparaît et
qu'« Accepter » a disparu. Sur une commande dont le paiement est reçu, l'avertissement
s'affiche avant l'annulation. Sur une commande expédiée, aucun bouton.

- [ ] **Step 8 : lint, typecheck et commit**

Run : `pnpm lint` puis `pnpm typecheck`
Attendu : 15 sur 15 chacun.

```bash
git add apps/admin/src/app/orders packages/i18n/messages/admin/fr.json
git commit -m "Let the administration advance an order from its detail page"
```

---

### Task 5 : le parcours navigateur, les pièges et la passation

**Files:**
- Create : `e2e/order-oversight.spec.ts`
- Modify : `docs/pieges.md`
- Modify : `docs/passation.md`

**Interfaces:**
- Consumes : `signInAsAdministrator`, `createApprovedVendorShop`, `publishProduct`,
  `URL_ADMIN`, `URL_STOREFRONT`, de `e2e/helpers/accounts.ts`.
- Produces : rien, c'est la dernière tâche.

- [ ] **Step 1 : écrire le parcours**

Celui de la section 9 de la spec : une commande est passée, le vendeur ne fait rien,
l'administration l'annule, et l'acheteur la voit annulée.

Le parcours doit porter un CONTRÔLE POSITIF sur les boutons, et pas seulement une absence :
asserter que « Annuler » est présent sur la commande reçue, puis qu'après l'annulation plus
aucun bouton d'action n'est rendu. Une assertion d'absence seule passerait à vide le jour où
un libellé change.

- [ ] **Step 2 : lancer le parcours**

Run : `pnpm exec playwright test e2e/order-oversight.spec.ts`
Attendu : PASS. Le lancer plusieurs fois : un parcours qui passe une fois sur une pile de
cette taille en dit moins qu'on ne croit.

**Lancer contre `pnpm docker:up`, la pile de DÉVELOPPEMENT, et surtout pas `pnpm e2e:up`** :
la superposition de production allume le limiteur de débit de Better Auth et la création de
comptes prend des 429.

- [ ] **Step 3 : lancer la suite complète**

Run : `pnpm exec playwright test`
Attendu : la suite n'est pas verte d'un bloc sur les postes de développement, et ce n'est
pas le fait de cette tranche. Rapporter ce qui échoue, ne rien réparer hors de sa propre
spec, et laisser la CI trancher sur son runner dédié.

- [ ] **Step 4 : consigner ce qui mérite de l'être**

Dans `docs/pieges.md`, si et seulement si quelque chose a été payé qu'une lecture du code ne
donnait pas. Le candidat connu : la pagination par `OFFSET` sans colonne finale unique, si
l'étape 5 de la tâche 2 a montré quelque chose d'observable. Si elle n'a rien montré, ne pas
écrire d'entrée : une entrée de pièges qui rapporte une inquiétude plutôt qu'une mesure
affaiblit les autres.

Chaque entrée dit le SYMPTÔME d'abord, avec la chaîne d'erreur que son lecteur aura sous les
yeux, puis la cause, puis ce qui protège maintenant.

Dans `docs/passation.md` : la ligne de la tranche, et une section disant ce qui est livré et
ce qu'un repreneur doit savoir. Les deux décisions du commanditaire de la section 2 de la
spec y sont reportées, parce qu'elles sont réversibles et méritent d'être relues : que
l'administration peut tout faire, et qu'aucun auteur n'est enregistré.

Ne réécrire aucune section appartenant à une autre tranche. Une passation a déjà écrasé les
chiffres d'une tranche voisine et il a fallu un commit pour les rendre.

- [ ] **Step 5 : commit**

```bash
git add e2e/order-oversight.spec.ts docs/pieges.md docs/passation.md
git commit -m "Prove the administration can unblock an order, and record what this cost"
```

---
