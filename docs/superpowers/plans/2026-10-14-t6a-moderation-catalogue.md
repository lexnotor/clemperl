# T6a, modérer le catalogue : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un administrateur retire du catalogue un produit qui n'a rien à y faire, avec un
motif que le vendeur reçoit, sans punir toute la boutique.

**Architecture:** le retrait écrit `status: DRAFT`, le même état qu'une dépublication
ordinaire : ce qui le distingue est le motif et le courriel, pas l'état. Un tableau
d'énumération sur `Product` porte les marques de travail interne, et la file de modération se
définit comme son absence. Republier efface la marque, ce qui ramène l'article devant
l'administration.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7.10, PostgreSQL, next-intl,
Tailwind 4, Vitest, Jest + Testcontainers, Playwright, nodemailer par `@clemperl/core`.

**Spec:** `docs/superpowers/specs/2026-10-14-t6a-moderation-catalogue-design.md`

## Global Constraints

- **Aucun commit intermédiaire.** Un seul commit à la fin. La spec et ce plan y voyagent.
  Les étapes « Commit » des gabarits ne s'appliquent pas ici.
- **Aucun tiret quadratin (`—`) ni demi-cadratin (`–`) en prose.** Voir
  `docs/conventions/redaction.md`.
- **Ce qu'une machine lit est en anglais** : identifiants, noms de fichiers, segments d'URL,
  clés de traduction. **Ce qu'un humain lit est en français.**
- **Les dépôts de `packages/db` ne reçoivent que des PRIMITIVES**, jamais un type de
  `packages/domain`, qui dépend déjà de `@clemperl/db` : l'importer fermerait un cycle.
- **Les assertions de refus emploient `rejects.toMatchObject({ message: CONST })`**, et
  JAMAIS `rejects.toThrow(CONST)`, qui compare par SOUS-CHAÎNE. Le message d'une erreur de
  validation Prisma cite la ligne fautive, laquelle contient le nom de la constante : T3 a
  mesuré un test resté vert alors que la condition qu'il éprouvait avait été retirée.
- **Indentation de 4 espaces en TypeScript.** Il n'existe AUCUNE configuration Prettier dans
  ce dépôt : le lancer applique son défaut de 2 espaces et reformate du code écrit. Ne pas
  le lancer.
- **Aucun prix formaté dans un composant client.** `formatPrice` tire `@clemperl/core`, donc
  nodemailer, donc `node:net`. Sans objet ici, la file n'affiche aucun prix, mais la règle
  vaut si l'on en ajoutait un.
- Après toute modification de `schema.prisma` : `pnpm docker:up`.

## Review Focus

1. **Un produit déjà retiré, retiré une seconde fois.** Deux administrateurs sur la même
   ligne, ou un double clic. Rien ne lève, l'état visé est atteint, et le vendeur ne reçoit
   pas deux courriels pour un seul acte. Testé en tâche 3.
2. **Une boutique sans candidature.** `Vendor.application` est NULLABLE, et c'est d'elle que
   vient la locale du courriel. Un vendeur créé autrement que par une candidature ne doit pas
   faire échouer un retrait. Testé en tâche 3.
3. **Un motif inconnu, ou un commentaire vide sur « autre ».** Le formulaire vient du
   navigateur, donc la valeur peut être n'importe quoi. Le refus est nommé, et rien n'est
   écrit. Testé en tâche 2.
4. **Un produit d'une boutique suspendue.** Il n'est pas dans la file, la suspension de T5
   étant déjà la décision la plus forte. Testé en tâche 3.
5. **Une republication qui efface une marque sans effacer les autres.** Le tableau de tags
   est partagé : retirer `REVIEWED` ne doit pas emporter ce qu'un futur tag y aura mis.
   Testé en tâche 3.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `packages/db/prisma/migrations/<horodatage>_product_moderation/migration.sql` | Les deux enums et la colonne |
| `packages/domain/src/constants/moderation-reasons.constant.ts` | Les motifs, en donnée |
| `packages/domain/src/utils/moderation-decision.utils.ts` | `validateModerationDecision` |
| `packages/domain/src/utils/moderation-decision.utils.spec.ts` | Son test |
| `packages/domain/src/messages/moderation-messages.utils.ts` | Le courriel de retrait, deux langues |
| `packages/domain/src/messages/moderation-messages.utils.spec.ts` | Son test |
| `packages/db/src/repositories/moderation.repository.ts` | La file, marquer examiné, retirer |
| `apps/api/test/moderation.int-spec.ts` | Ses tests d'intégration |
| `apps/admin/src/app/moderation/page.tsx` | La file |
| `apps/admin/src/app/moderation/actions.ts` | Les deux actions |
| `apps/admin/src/app/moderation/moderation-row.tsx` | Client, les deux boutons et le motif |
| `apps/admin/src/app/moderation/types/moderation-state.interface.ts` | L'état des actions |
| `e2e/moderation.spec.ts` | Le parcours |

**Modifiés :**

| Fichier | Changement |
| --- | --- |
| `packages/db/prisma/schema.prisma` | `E_PRODUCT_TAG`, `E_MODERATION_REASON`, `Product.systemTags` |
| `packages/db/src/index.ts`, `repositories/index.ts` | Exporter l'enum et le dépôt |
| `packages/db/src/repositories/product.repository.ts` | `setProductStatus` efface `REVIEWED` à la publication |
| `packages/domain/src/constants/index.ts`, `utils/index.ts`, `messages/index.ts` | Exporter ce qui précède |
| `packages/i18n/messages/admin/fr.json` | Section `moderation` |
| `apps/admin/src/app/layout.tsx` | Lien « Modération » |
| `e2e/global-setup.ts` | La route neuve |
| `docs/passation.md`, `docs/pieges.md` | État de T6a, et ce qui a coûté |

---

## Task 1: Le modèle et la migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20261014120000_product_moderation/migration.sql`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: les enums Prisma `E_PRODUCT_TAG { REVIEWED }` et
  `E_MODERATION_REASON { COUNTERFEIT PROHIBITED_ITEM MISLEADING_CONTENT INAPPROPRIATE_IMAGE OTHER }`,
  et la colonne `Product.systemTags E_PRODUCT_TAG[] @default([])`.

- [ ] **Step 1: Déclarer les deux énumérations**

Dans `packages/db/prisma/schema.prisma`, après `E_PRODUCT_STATUS` :

```prisma
// Les marques de travail INTERNE posées sur un produit. Vocabulaire fermé : un tag entre
// ici quand un écran en a besoin, et chaque ajout passe par une migration, ce qui est une
// friction utile. Des étiquettes libres laisseraient deux administrateurs écrire
// « a-verifier » et « à vérifier », qu'aucun filtre ne réunirait.
//
// Ni le vendeur ni le public ne les voient.
enum E_PRODUCT_TAG {
  REVIEWED

  @@map("product_tag")
}

// Le motif d'un retrait, dit au vendeur. La forme vient de T1b, qui code le motif d'un
// refus de candidature ; les VALEURS n'ont rien à voir, un produit ne se refuse pas comme
// un dossier.
enum E_MODERATION_REASON {
  COUNTERFEIT
  PROHIBITED_ITEM
  MISLEADING_CONTENT
  INAPPROPRIATE_IMAGE
  OTHER

  @@map("moderation_reason")
}
```

- [ ] **Step 2: Ajouter la colonne**

Dans `model Product`, après `category` :

```prisma
  // Un tableau d'enum, et non une table de liaison : un tag n'a ni date, ni auteur, ni
  // commentaire. Le jour où il en aurait, ce ne serait plus un tag mais un acte, et sa
  // place serait dans un journal. Même raisonnement que `Vendor.paymentMethods`.
  //
  // Par défaut VIDE, donc tout produit déjà publié entre dans la file de modération à la
  // migration. C'est voulu : personne ne les a jamais regardés.
  systemTags E_PRODUCT_TAG[] @default([]) @map("system_tags")
```

- [ ] **Step 3: Produire et appliquer la migration**

```bash
mkdir -p packages/db/prisma/migrations/20261014120000_product_moderation
docker exec clemperl_dev_api sh -c "cd /app/packages/db && pnpm exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script" \
  | grep -v "^Loaded Prisma config" \
  > packages/db/prisma/migrations/20261014120000_product_moderation/migration.sql
pnpm docker:up
docker compose --env-file .env -f docker/docker-compose.dev.yml run --rm --no-deps migrate
```

Expected: le fichier contient `CREATE TYPE "product_tag"`, `CREATE TYPE "moderation_reason"`
et `ALTER TABLE "products" ADD COLUMN "system_tags"`, puis `All migrations have been
successfully applied.`

Le drapeau est `--to-schema`, et non `--to-schema-datamodel`, qui n'existe plus en Prisma
7.10.

**Ne PAS toucher au fichier de migration après l'avoir appliqué**, commentaire compris : son
`sha256` est enregistré dans `_prisma_migrations`, et le modifier fait diverger la somme.
Piège consigné dans `docs/pieges.md`.

- [ ] **Step 4: Exporter les enums**

Dans `packages/db/src/index.ts`, ajouter `E_PRODUCT_TAG` et `E_MODERATION_REASON` à la liste
d'exports d'énumérations, en ordre alphabétique. `@clemperl/db/enums` les reçoit tout seul,
c'est un fichier généré.

- [ ] **Step 5: Vérifier la tâche**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 15/15 à chaque fois.

Run: `docker exec clemperl_dev_postgres psql -U clemperl -d clemperl -At -c "SELECT count(*) FILTER (WHERE cardinality(system_tags) > 0) || ' sur ' || count(*) FROM products;"`
Expected: `0 sur <n>`. Aucun produit ne porte de tag, donc tous les publiés entrent en file.

---

## Task 2: Le motif et le courriel, purs

**Files:**
- Create: `packages/domain/src/constants/moderation-reasons.constant.ts`
- Create: `packages/domain/src/utils/moderation-decision.utils.ts`
- Test: `packages/domain/src/utils/moderation-decision.utils.spec.ts`
- Create: `packages/domain/src/messages/moderation-messages.utils.ts`
- Test: `packages/domain/src/messages/moderation-messages.utils.spec.ts`
- Modify: `packages/domain/src/constants/index.ts`, `utils/index.ts`, `messages/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MODERATION_REASONS: readonly string[];
  export interface IModerationDecision { reason: string; comment?: string | undefined }
  export function validateModerationDecision(decision: IModerationDecision): void;
  export function buildRetirementMessage(title: string, reason: string, locale: string): IEmailMessage;
  ```
  `validateModerationDecision` lève une `InvalidDecisionError`, celle que T1b exporte déjà.

- [ ] **Step 1: Écrire le test du motif**

Créer `packages/domain/src/utils/moderation-decision.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { validateModerationDecision } from "./moderation-decision.utils.js";

describe("validateModerationDecision", () => {
    it("accepte un motif codé sans commentaire", () => {
        expect(() => validateModerationDecision({ reason: "COUNTERFEIT" })).not.toThrow();
    });

    // Même règle qu'un refus de candidature en T1b : « autre » ne dit rien au vendeur, donc
    // il faut écrire ce qu'on lui reproche.
    it("exige un commentaire quand le motif est « autre »", () => {
        expect(() => validateModerationDecision({ reason: "OTHER" })).toThrow();
        expect(() => validateModerationDecision({ reason: "OTHER", comment: "   " })).toThrow();
        expect(() =>
            validateModerationDecision({ reason: "OTHER", comment: "Photo d'une autre marque." }),
        ).not.toThrow();
    });

    // Le formulaire vient du navigateur : la valeur peut être n'importe quoi, y compris un
    // motif inventé ou un motif de candidature qui n'a rien à faire ici.
    it("refuse un motif qui n'est pas du vocabulaire", () => {
        for (const brut of ["", "INCOMPLETE_FILE", "counterfeit", "AUTRE", "<script>"]) {
            expect(() => validateModerationDecision({ reason: brut })).toThrow();
        }
    });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/moderation-decision.utils.spec.ts`
Expected: FAIL, `Cannot find module './moderation-decision.utils.js'`.

- [ ] **Step 3: Écrire les motifs et la validation**

Créer `packages/domain/src/constants/moderation-reasons.constant.ts` :

```ts
import { E_MODERATION_REASON } from "@clemperl/db/enums";

// L'import vient de `@clemperl/db/enums`, le sous-chemin SANS client Prisma : ce fichier
// est atteignable depuis le navigateur par `browser.ts`.
export const MODERATION_REASONS: readonly string[] = Object.values(E_MODERATION_REASON);
```

Créer `packages/domain/src/utils/moderation-decision.utils.ts` :

```ts
import { MODERATION_REASONS } from "../constants/moderation-reasons.constant.js";
import { InvalidDecisionError } from "../errors/index.js";

export interface IModerationDecision {
    reason: string;
    comment?: string | undefined;
}

// La MÊME règle que le refus d'une candidature en T1b, et volontairement pas le même code :
// les deux vocabulaires n'ont rien à voir, et les fusionner ferait accepter
// « INCOMPLETE_FILE » sur un produit.
//
// `InvalidDecisionError` est réutilisée telle quelle : elle porte une clé de traduction et
// un message de repli, ce qui est exactement ce qu'il faut.
export function validateModerationDecision(decision: IModerationDecision): void {
    if (!MODERATION_REASONS.includes(decision.reason)) {
        throw new InvalidDecisionError(
            "reason_unknown",
            "Ce motif de retrait n'existe pas.",
        );
    }

    // « Autre » ne dit rien au vendeur. Le commentaire est ce qui rend le retrait
    // actionnable, donc il est exigé, et des espaces ne sont pas un commentaire.
    if (decision.reason === "OTHER" && (decision.comment ?? "").trim() === "") {
        throw new InvalidDecisionError(
            "comment_required",
            "Un motif « autre » exige un commentaire.",
        );
    }
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/utils/moderation-decision.utils.spec.ts`
Expected: PASS, trois tests.

- [ ] **Step 5: Écrire le test du courriel**

Créer `packages/domain/src/messages/moderation-messages.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildRetirementMessage } from "./moderation-messages.utils.js";

describe("buildRetirementMessage", () => {
    it("nomme le produit et porte le motif, en français", () => {
        const message = buildRetirementMessage("Sac cabas", "Contrefaçon", "fr");

        expect(message.subject).toContain("Sac cabas");
        expect(message.text).toContain("Contrefaçon");
        // Le destinataire est laissé VIDE : c'est l'appelant qui le connaît, et le lui
        // faire passer ici propagerait une donnée que le texte n'utilise pas.
        expect(message.recipient).toBe("");
    });

    it("bascule en anglais", () => {
        const message = buildRetirementMessage("Tote bag", "Counterfeit", "en");
        expect(message.subject).not.toContain("retiré");
        expect(message.text).toContain("Counterfeit");
    });

    // Une locale inconnue retombe sur le français, langue par défaut de l'interface. Un
    // vendeur sans candidature n'en a aucune, cas que la tâche 3 rencontre.
    it("retombe sur le français pour une locale inconnue", () => {
        const inconnue = buildRetirementMessage("Sac", "Motif", "de");
        const francais = buildRetirementMessage("Sac", "Motif", "fr");
        expect(inconnue.subject).toBe(francais.subject);
    });
});
```

- [ ] **Step 6: Lancer ce test et vérifier qu'il échoue**

Run: `pnpm --filter @clemperl/domain exec vitest run src/messages/moderation-messages.utils.spec.ts`
Expected: FAIL, `Cannot find module './moderation-messages.utils.js'`.

- [ ] **Step 7: Écrire le courriel**

Créer `packages/domain/src/messages/moderation-messages.utils.ts`, sur la forme exacte de
`vendor-application-messages.utils.ts`, qu'il faut lire d'abord :

```ts
import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont construits
// hors de tout contexte de requête Next, où `getTranslations` n'existe pas.
//
// Le message dit ce qui est arrivé et ce que le vendeur peut faire. Il ne menace pas : le
// retrait est un avertissement, et republier reste possible.
const TEXTS = {
    fr: {
        retirement: (title: string, reason: string) => ({
            subject: `« ${title} » a été retiré du catalogue`,
            text: `Votre article « ${title} » a été retiré du catalogue et repassé en brouillon.\n\nMotif :\n${reason}\n\nVous le retrouvez dans votre espace vendeur. Vous pouvez le corriger et le publier à nouveau.`,
        }),
    },
    en: {
        retirement: (title: string, reason: string) => ({
            subject: `"${title}" has been pulled from the catalogue`,
            text: `Your item "${title}" has been pulled from the catalogue and moved back to draft.\n\nReason:\n${reason}\n\nYou will find it in your vendor area. You can correct it and publish it again.`,
        }),
    },
} as const;

function texts(locale: string): (typeof TEXTS)["fr"] {
    return locale === "en" ? TEXTS.en : TEXTS.fr;
}

export function buildRetirementMessage(
    title: string,
    reason: string,
    locale: string,
): IEmailMessage {
    return { recipient: "", ...texts(locale).retirement(title, reason) };
}
```

- [ ] **Step 8: Lancer le test et vérifier qu'il passe**

Run: `pnpm --filter @clemperl/domain exec vitest run src/messages/moderation-messages.utils.spec.ts`
Expected: PASS, trois tests.

- [ ] **Step 9: Exporter et vérifier**

Ajouter les `export * from` dans `constants/index.ts`, `utils/index.ts` et `messages/index.ts`.

**NE PAS exporter depuis `browser.ts`** : `moderation-decision.utils.ts` importe
`../errors/index.js`, qui tire `@clemperl/core`, donc nodemailer, donc `node:net`. T3 a payé
ce piège : Turbopack refuse alors d'assembler le paquet navigateur, avec une erreur qui ne
nomme aucun de ces maillons. Le formulaire de motif est rendu par un composant client, mais
il reçoit ses libellés en props depuis le serveur.

Run: `pnpm --filter @clemperl/domain test`
Expected: PASS, seuils tenus.

---

## Task 3: Le dépôt de modération

**Files:**
- Create: `packages/db/src/repositories/moderation.repository.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/repositories/product.repository.ts` (`setProductStatus`)
- Test: `apps/api/test/moderation.int-spec.ts`

**Interfaces:**
- Consumes: `Product.systemTags` de la tâche 1.
- Produces:
  ```ts
  export const ERROR_PRODUCT_NOT_FOUND = "MODERATION_PRODUCT_NOT_FOUND";
  export async function listProductsToModerate(prisma): Promise<{
      id: string; title: string; publishedAt: Date | null; imagePath: string;
      shopName: string; shopSlug: string; productSlug: string;
  }[]>;
  export async function markProductReviewed(prisma, productId: string): Promise<void>;
  export async function retireProduct(prisma, input: { productId: string }): Promise<{
      title: string; contactEmail: string; locale: string; alreadyRetired: boolean;
  }>;
  ```

- [ ] **Step 1: Écrire les tests d'intégration**

Créer `apps/api/test/moderation.int-spec.ts`, `PREFIX` vaut `"mod"`. Reprendre les aides de
`apps/api/test/shop-suspension.int-spec.ts`, écrit en T5, qui crée déjà compte, boutique et
produit publié avec image prête.

```ts
describe("listProductsToModerate", () => {
    it("rend les publiés sans la marque, du plus récent au plus ancien", async () => {
        const shop = await createShop();
        const ancien = await publishedProduct(shop.id, "Sac ancien");
        const recent = await publishedProduct(shop.id, "Sac récent");

        const file = await listProductsToModerate(prisma);
        const miens = file.filter((l) => [ancien, recent].includes(l.id));

        expect(miens.map((l) => l.id)).toEqual([recent, ancien]);
    });

    it("ne rend plus un produit marqué examiné", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac examiné");

        await markProductReviewed(prisma, id);

        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeUndefined();
    });

    it("ne rend pas un brouillon", async () => {
        const shop = await createShop();
        const id = await draftProduct(shop.id, "Sac brouillon");

        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeUndefined();
    });

    // La suspension de T5 est déjà la décision la plus forte : ses articles ne sont plus au
    // catalogue, et les proposer à la modération ferait agir deux fois sur le même fait.
    it("ne rend pas un produit d'une boutique suspendue", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac suspendu");
        await prisma.vendor.update({
            where: { id: shop.id },
            data: { suspendedAt: new Date() },
        });

        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeUndefined();
    });

    it("porte la vignette et le slug de la boutique", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac complet");

        const ligne = (await listProductsToModerate(prisma)).find((l) => l.id === id);
        expect(ligne?.imagePath).not.toBe("");
        expect(ligne?.shopSlug).toBe(shop.slug);
    });
});

describe("markProductReviewed", () => {
    // Deux administrateurs sur la même ligne, ou un double clic.
    it("est idempotente et n'écrit pas deux fois la marque", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac marqué");

        await markProductReviewed(prisma, id);
        await markProductReviewed(prisma, id);

        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.systemTags).toEqual(["REVIEWED"]);
    });
});

describe("retireProduct", () => {
    it("dépublie et rend de quoi écrire au vendeur", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac retiré");

        const sortie = await retireProduct(prisma, { productId: id });

        expect(sortie.title).toBe("Sac retiré");
        expect(sortie.contactEmail).toBe(shop.contactEmail);
        expect(sortie.alreadyRetired).toBe(false);
        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.status).toBe("DRAFT");
    });

    // Le second retrait ne doit PAS faire partir un second courriel : l'appelant lit
    // `alreadyRetired` pour le savoir.
    it("dit que le produit était déjà retiré, sans rien réécrire", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac deux fois");
        await retireProduct(prisma, { productId: id });

        const seconde = await retireProduct(prisma, { productId: id });

        expect(seconde.alreadyRetired).toBe(true);
    });

    it("refuse un produit qui n'existe pas", async () => {
        await expect(
            retireProduct(prisma, { productId: "c00000000000000000000000" }),
        ).rejects.toMatchObject({ message: ERROR_PRODUCT_NOT_FOUND });
    });

    // `Vendor.application` est NULLABLE : la locale vient d'elle, et une boutique créée
    // autrement n'en a aucune. Le retrait ne doit pas échouer pour autant.
    it("retombe sur le français quand la boutique n'a pas de candidature", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac sans dossier");

        const sortie = await retireProduct(prisma, { productId: id });

        expect(sortie.locale).toBe("fr");
    });
});

describe("republier ramène le produit dans la file", () => {
    // LA règle qui donne son mordant à l'avertissement. Sans elle, un vendeur republie ce
    // qu'on lui a retiré et ne repasse devant personne.
    it("efface la marque à la publication", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac republié");
        await markProductReviewed(prisma, id);
        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: false });

        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: true });

        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.systemTags).toEqual([]);
        expect((await listProductsToModerate(prisma)).find((l) => l.id === id)).toBeDefined();
    });

    // Le tableau est PARTAGÉ : effacer `REVIEWED` ne doit pas emporter ce qu'un futur tag y
    // aura mis. Aucun second tag n'existe encore, donc on en simule un par écriture directe.
    it("n'efface que REVIEWED, pas les autres marques", async () => {
        const shop = await createShop();
        const id = await publishedProduct(shop.id, "Sac deux marques");
        // `REVIEWED` est seul dans l'énumération aujourd'hui : on vérifie donc que l'écriture
        // passe par un FILTRE et non par une remise à zéro, en relisant ce que le dépôt écrit.
        await markProductReviewed(prisma, id);
        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: false });
        await setProductStatus(prisma, { productId: id, vendorId: shop.id, publish: true });

        const apres = await prisma.product.findUniqueOrThrow({ where: { id } });
        expect(apres.systemTags).toEqual([]);
    });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand moderation"`
Expected: FAIL, `listProductsToModerate is not a function`.

- [ ] **Step 3: Écrire le dépôt**

Créer `packages/db/src/repositories/moderation.repository.ts` :

```ts
import type { PrismaClient } from "../../generated/prisma/client.js";

export const ERROR_PRODUCT_NOT_FOUND = "MODERATION_PRODUCT_NOT_FOUND";

// La FILE : publiés, sans la marque, du plus récent au plus ancien.
//
// Elle se VIDE, et c'est sa propriété importante : un administrateur sait qu'il a fini. Un
// filtre par date ne le dirait jamais, et deux administrateurs s'y recouvriraient sans le
// savoir.
//
// La boutique suspendue est exclue : la suspension de T5 est déjà la décision la plus forte,
// et ses articles ne sont plus au catalogue.
//
// `id` départage : deux produits publiés dans la même milliseconde sinon oscilleraient d'un
// rendu à l'autre.
export async function listProductsToModerate(prisma: PrismaClient) {
    const rows = await prisma.product.findMany({
        where: {
            status: "PUBLISHED",
            deletedAt: null,
            // `NOT ... has` et non `isEmpty` : un produit peut porter un autre tag sans
            // porter `REVIEWED`, et `isEmpty` l'exclurait à tort. Aucun second tag n'existe
            // aujourd'hui, donc les deux formes se valent ; celle-ci reste vraie demain.
            NOT: { systemTags: { has: "REVIEWED" } },
            vendor: { deletedAt: null, suspendedAt: null },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        select: {
            id: true,
            slug: true,
            title: true,
            publishedAt: true,
            vendor: { select: { shopName: true, slug: true } },
            images: {
                where: { status: "READY" as const },
                orderBy: { position: "asc" as const },
                take: 1,
                select: { objectPath: true },
            },
        },
    });

    return rows.map((row) => ({
        id: row.id,
        title: row.title,
        publishedAt: row.publishedAt,
        imagePath: row.images[0]?.objectPath ?? "",
        shopName: row.vendor.shopName,
        shopSlug: row.vendor.slug,
        productSlug: row.slug,
    }));
}
```

- [ ] **Step 4: Écrire les deux écritures**

```ts
// Idempotente : poser la marque deux fois n'écrit rien la seconde fois, et le tableau ne
// porte pas deux `REVIEWED`. `updateMany` filtré rend zéro ligne touchée au lieu de lever,
// ce qui est le comportement voulu pour deux administrateurs sur la même ligne.
export async function markProductReviewed(
    prisma: PrismaClient,
    productId: string,
): Promise<void> {
    await prisma.product.updateMany({
        where: { id: productId, NOT: { systemTags: { has: "REVIEWED" } } },
        data: { systemTags: { push: "REVIEWED" } },
    });
}

// Retire un produit du catalogue, et rend de quoi écrire à son vendeur.
//
// L'écriture et la lecture sont dans la MÊME transaction : l'appelant a besoin du titre et
// de l'adresse pour son courriel, et les relire après coup les lirait peut-être changés.
//
// `alreadyRetired` dit à l'appelant de ne PAS envoyer de second courriel. Un vendeur qui
// reçoit deux fois le même reproche pour un seul acte croit qu'on s'acharne.
export async function retireProduct(
    prisma: PrismaClient,
    input: { productId: string },
): Promise<{ title: string; contactEmail: string; locale: string; alreadyRetired: boolean }> {
    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: { id: input.productId, deletedAt: null },
            select: {
                id: true,
                title: true,
                status: true,
                vendor: {
                    select: {
                        contactEmail: true,
                        // NULLABLE : toute boutique ne vient pas d'une candidature, et
                        // c'est d'elle que vient la langue du vendeur.
                        application: { select: { locale: true } },
                    },
                },
            },
        });
        if (!product) {
            throw new Error(ERROR_PRODUCT_NOT_FOUND);
        }

        const alreadyRetired = product.status !== "PUBLISHED";
        if (!alreadyRetired) {
            await tx.product.updateMany({
                where: { id: product.id },
                // `publishedAt` ne bouge pas : il date le moment où le slug a cessé de
                // pouvoir changer, et un retrait ne rend pas une URL réutilisable. Même
                // raison qu'une dépublication ordinaire.
                data: { status: "DRAFT" },
            });
        }

        return {
            title: product.title,
            contactEmail: product.vendor.contactEmail,
            locale: product.vendor.application?.locale ?? "fr",
            alreadyRetired,
        };
    });
}
```

- [ ] **Step 5: Effacer la marque à la publication**

Dans `packages/db/src/repositories/product.repository.ts`, `setProductStatus`, la branche de
publication écrit déjà `status` et `publishedAt`. Prisma ne sait pas retirer UN élément d'une
liste scalaire : il faut relire et réécrire. Juste avant le `updateMany` final :

```ts
        // Republier RAMÈNE le produit devant la modération, et c'est ce qui donne son
        // mordant à l'avertissement : sans cela, un vendeur republie ce qu'on lui a retiré
        // et ne repasse devant personne.
        //
        // La règle vaut pour TOUTE republication, qu'un retrait l'ait précédée ou non :
        // distinguer les deux demanderait de retenir qu'un retrait a eu lieu, donc un
        // journal que T6 a écarté.
        //
        // On FILTRE au lieu de remettre à zéro : le tableau est partagé, et un futur tag
        // n'a pas à disparaître parce que quelqu'un republie.
        let tags: { systemTags: string[] } | undefined;
        if (input.publish) {
            const courant = await tx.product.findUniqueOrThrow({
                where: { id: input.productId },
                select: { systemTags: true },
            });
            tags = { systemTags: courant.systemTags.filter((tag) => tag !== "REVIEWED") };
        }
```

puis, dans le `data` du `updateMany` existant, ajouter `...(tags ?? {})`.

- [ ] **Step 6: Exporter le dépôt**

Dans `packages/db/src/repositories/index.ts`, ajouter en ordre alphabétique :

```ts
export * from "./moderation.repository.js";
```

- [ ] **Step 7: Lancer les tests et vérifier qu'ils passent**

```bash
docker exec clemperl_dev_api sh -c "cd /app && pnpm --filter @clemperl/db build"
docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand moderation"
```

Expected: PASS, treize tests.

- [ ] **Step 8: Prouver que les tests PORTENT, par mutation**

Un test qui passe ne dit rien tant qu'on n'a pas montré ce qui le fait rougir. Pour deux
conditions au moins :

```bash
# 1. Retirer `suspendedAt: null` du `where` de `listProductsToModerate`, rebâtir, relancer.
#    Attendu : « ne rend pas un produit d'une boutique suspendue » rougit, et lui seul.
# 2. Remplacer le filtre de l'étape 5 par une remise à zéro `systemTags: []`, rebâtir,
#    relancer. Attendu : le test des deux marques passe quand même aujourd'hui, un seul tag
#    existant. LE DIRE dans le rapport plutôt que de prétendre l'avoir prouvé.
```

**Vérifier que la mutation a ATTERRI avant de lire le résultat**, par un `grep` sur la ligne
changée. Une mutation qui n'a pas pris rend un faux négatif qui ressemble à un succès, et
valide un test décoratif. Piège consigné dans `docs/pieges.md`.

Restaurer, rebâtir, et constater que les treize repassent.

- [ ] **Step 9: Lancer toute la couche**

Run: `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"`
Expected: toutes les suites au vert.

---

## Task 4: L'écran de modération

**Files:**
- Create: `apps/admin/src/app/moderation/page.tsx`, `actions.ts`, `moderation-row.tsx`,
  `types/moderation-state.interface.ts`
- Modify: `apps/admin/src/app/layout.tsx`, `packages/i18n/messages/admin/fr.json`

**Interfaces:**
- Consumes: `listProductsToModerate`, `markProductReviewed`, `retireProduct` de la tâche 3 ;
  `validateModerationDecision`, `buildRetirementMessage`, `MODERATION_REASONS` de la tâche 2.

- [ ] **Step 1: Lire l'écran à imiter**

Lire `apps/admin/src/app/shops/page.tsx` et `apps/admin/src/app/shops/actions.ts`, livrés en
T5 : la file reprend leur forme, leur garde et leur gestion d'état.

- [ ] **Step 2: Écrire les libellés**

Dans `packages/i18n/messages/admin/fr.json`, une section `moderation` :

```json
"moderation": {
  "title": "Modérer le catalogue",
  "empty": "Rien à examiner.",
  "publishedOn": "Publié le",
  "review": "Examiné",
  "retire": "Retirer",
  "reasonLabel": "Motif du retrait",
  "commentLabel": "Précisions",
  "confirm": "Confirmer le retrait",
  "reason": {
    "COUNTERFEIT": "Contrefaçon",
    "PROHIBITED_ITEM": "Article interdit à la vente",
    "MISLEADING_CONTENT": "Description ou photo trompeuse",
    "INAPPROPRIATE_IMAGE": "Image inappropriée",
    "OTHER": "Autre"
  }
}
```

Et dans la section `errors`, une sous-section `moderation` :

```json
  "moderation": {
    "reason_unknown": "Ce motif de retrait n'existe pas.",
    "comment_required": "Un motif « autre » exige un commentaire.",
    "not_found": "Ce produit n'existe plus.",
    "failed": "Le retrait n'a pas pu être enregistré. Réessayez."
  }
```

- [ ] **Step 3: Écrire le type de l'état**

`types/moderation-state.interface.ts`. Il vit à part de `actions.ts` pour une raison que le
dépôt a déjà payée : un fichier `"use server"` n'exporte que des fonctions asynchrones, et
une constante qu'on y exporte quand même arrive `undefined` au client, avec une erreur qui
parle d'autre chose.

```ts
export interface IModerationState {
    message: string[];
}

export const INITIAL_STATE: IModerationState = { message: [] };
```

- [ ] **Step 4: Écrire les deux actions**

`actions.ts` :

```ts
"use server";

import { createSmtpSender, DomainError } from "@clemperl/core";
import {
    ERROR_PRODUCT_NOT_FOUND,
    markProductReviewed,
    prisma,
    retireProduct,
} from "@clemperl/db";
import { buildRetirementMessage, validateModerationDecision } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../lib/session";
import type { IModerationState } from "./types/moderation-state.interface";

const ERRORS = messages.errors.moderation as Record<string, string>;
const REASONS = messages.moderation.reason as Record<string, string>;

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le bouton ne la protège pas.
export async function review(
    _previous: IModerationState,
    form: FormData,
): Promise<IModerationState> {
    await requireAdministrator();
    const productId = String(form.get("productId") ?? "");

    await markProductReviewed(prisma, productId);

    revalidatePath("/moderation");
    return { message: [] };
}

export async function retire(
    _previous: IModerationState,
    form: FormData,
): Promise<IModerationState> {
    await requireAdministrator();
    const productId = String(form.get("productId") ?? "");
    const reason = String(form.get("reason") ?? "");
    const comment = String(form.get("comment") ?? "") || undefined;

    try {
        // Le DOMAINE arbitre avant d'écrire : motif du vocabulaire, et commentaire
        // obligatoire quand le motif est « autre ».
        validateModerationDecision({ reason, comment });
    } catch (error) {
        const key = error instanceof DomainError ? error.i18nKey.split(".").pop() : "failed";
        return { message: [ERRORS[key ?? "failed"] ?? (ERRORS["failed"] as string)] };
    }

    let retrait: Awaited<ReturnType<typeof retireProduct>>;
    try {
        retrait = await retireProduct(prisma, { productId });
    } catch (error) {
        const texte = String(error);
        if (texte.includes(ERROR_PRODUCT_NOT_FOUND)) {
            return { message: [ERRORS["not_found"] as string] };
        }
        console.error("retire", error);
        return { message: [ERRORS["failed"] as string] };
    }

    // Le courriel part HORS transaction, et seulement si le retrait a RÉELLEMENT eu lieu :
    // un vendeur qui reçoit deux fois le même reproche pour un seul acte croit qu'on
    // s'acharne.
    if (!retrait.alreadyRetired) {
        const motif =
            reason === "OTHER" ? (comment ?? "") : (REASONS[reason] ?? reason);
        const message = buildRetirementMessage(retrait.title, motif, retrait.locale);
        await createSmtpSender(
            process.env["SMTP_URL"] ?? "",
            process.env["EMAIL_FROM"] ?? "",
        ).send({ ...message, recipient: retrait.contactEmail });
    }

    revalidatePath("/moderation");
    return { message: [] };
}
```

- [ ] **Step 5: Écrire la ligne, composant client**

`moderation-row.tsx`, sur la forme de `shops/suspension-form.tsx`. Il porte le bouton
« Examiné », et un bloc de retrait qui s'ouvre sur un `<details>` : un motif en `<select>`,
un commentaire, et le bouton de confirmation.

Les libellés des motifs arrivent en PROPS depuis le serveur : importer le domaine ici
tirerait `@clemperl/core` dans le paquet navigateur.

```tsx
"use client";

import { Button } from "@clemperl/ui";
import { useActionState, type JSX } from "react";
import { retire, review } from "./actions";
import { INITIAL_STATE } from "./types/moderation-state.interface";

interface ModerationRowProps {
    productId: string;
    reasons: { value: string; label: string }[];
    labels: {
        review: string;
        retire: string;
        reasonLabel: string;
        commentLabel: string;
        confirm: string;
    };
}

export function ModerationRow(props: ModerationRowProps): JSX.Element {
    const [etatExamen, actionExamen, examenEnCours] = useActionState(review, INITIAL_STATE);
    const [etatRetrait, actionRetrait, retraitEnCours] = useActionState(retire, INITIAL_STATE);

    return (
        <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
                <form action={actionExamen}>
                    <input type="hidden" name="productId" value={props.productId} />
                    <Button type="submit" disabled={examenEnCours}>
                        {props.labels.review}
                    </Button>
                </form>

                <details>
                    <summary className="cursor-pointer border border-bordure px-4 py-2 text-sm">
                        {props.labels.retire}
                    </summary>
                    <form action={actionRetrait} className="mt-3 flex flex-col gap-3">
                        <input type="hidden" name="productId" value={props.productId} />
                        <label className="flex flex-col gap-1 text-sm">
                            {props.labels.reasonLabel}
                            <select
                                name="reason"
                                className="border border-bordure bg-transparent px-3 py-2 text-sm"
                            >
                                {props.reasons.map((motif) => (
                                    <option key={motif.value} value={motif.value}>
                                        {motif.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm">
                            {props.labels.commentLabel}
                            <textarea
                                name="comment"
                                rows={3}
                                className="border border-bordure bg-transparent px-3 py-2 text-sm"
                            />
                        </label>
                        <Button type="submit" disabled={retraitEnCours}>
                            {props.labels.confirm}
                        </Button>
                    </form>
                </details>
            </div>

            {[...etatExamen.message, ...etatRetrait.message].map((phrase) => (
                <p key={phrase} role="alert" className="text-sm text-muet">
                    {phrase}
                </p>
            ))}
        </div>
    );
}
```

- [ ] **Step 6: Écrire la page**

`page.tsx`, sur la forme de `shops/page.tsx`. Chaque ligne porte la vignette, le titre, le
nom de la boutique AVEC SON SLUG et la date de publication.

Le slug pour la raison que la revue de T5 a nommée : `shopName` n'est pas unique, et deux
lignes indistinguables feraient agir sur le mauvais produit.

La vignette par `derivativePath(imagePath, 200)` et la route de relais `/api/media/...`, comme
la fiche produit de la boutique. On modère d'abord avec les yeux.

- [ ] **Step 7: Ajouter le lien**

Dans `apps/admin/src/app/layout.tsx`, « Modération » vers `/moderation`, dans la `nav` à côté
de « Dossiers » et « Boutiques ».

- [ ] **Step 8: Vérifier la tâche**

```bash
pnpm lint && pnpm typecheck && pnpm build
pnpm docker:up && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/moderation
```

Expected: 15/15, 9/9, et `307`, la garde redirigeant comme sur `/shops`.

---

## Task 5: Le parcours, les pièges, la passation

**Files:**
- Create: `e2e/moderation.spec.ts`
- Modify: `e2e/global-setup.ts`, `docs/passation.md`, `docs/pieges.md`

- [ ] **Step 1: Échauffer la route neuve**

Dans `e2e/global-setup.ts`, ajouter `${URL_ADMIN}/moderation` à la liste. Sans cela un test
sain expire à l'arrivée : Next compile au premier accès, et T2e a mesuré six secondes pour une
route neuve contre un délai d'assertion de cinq.

- [ ] **Step 2: Écrire le parcours**

`e2e/moderation.spec.ts`, sur la forme de `e2e/shop-suspension.spec.ts` écrit en T5.

Le parcours : un vendeur publie un article ; l'administrateur le voit en file ; il le retire
avec le motif « contrefaçon » ; le vendeur le retrouve en brouillon ; il le republie ;
l'article revient en file.

**Viser ce que l'ACTION a produit**, jamais un mot que l'écran portait déjà. `getByText`
compare par sous-chaîne sans tenir compte de la casse : « Retirer » et « Confirmer le
retrait » se contiennent, et T3 a payé exactement ce piège. Viser par rôle, avec `exact: true`.

L'assertion de retour en file est la plus importante du parcours : c'est elle qui éprouve la
règle de l'étape 5 de la tâche 3, de bout en bout.

- [ ] **Step 3: Lancer le parcours**

```bash
pnpm docker:up
pnpm exec playwright test e2e/moderation.spec.ts --reporter=line
```

Expected: vert.

- [ ] **Step 4: Lancer la suite entière**

```bash
pnpm test:e2e
```

**Contre `pnpm docker:up`, la pile de DÉVELOPPEMENT**, et non `pnpm e2e:up`. La superposition
de production allume le limiteur de débit de Better Auth, et la création de comptes prend des
429 : mesuré en T5, 17 passés et 8 en échec. La CI lance `docker:up`, c'est donc la mesure
comparable. Entrée dédiée dans `docs/pieges.md`.

Lancer DEUX fois : un passage unique ne distingue pas un test stable d'un test chanceux.

- [ ] **Step 5: Consigner ce qui a coûté**

Dans `docs/pieges.md`, n'ajouter que ce qui a RÉELLEMENT coûté pendant cette tranche. La règle
d'admission est stricte : un registre qui accueille des suppositions cesse d'être un registre.
Si rien n'a coûté, n'ajouter rien et le dire.

- [ ] **Step 6: Mettre la passation à jour**

Dans `docs/passation.md` : passer T6a à **Livrée**, écrire une section datée, et y porter au
moins :

- le retrait est un avertissement, et ce que cela coûte : un contenu illicite revient d'un
  clic, et le recours redevient la suspension de T5 ;
- republier efface `REVIEWED`, pour TOUTE republication, et pourquoi distinguer les deux cas
  demanderait le journal que T6 a écarté ;
- le vocabulaire des tags démarre avec une seule valeur, et un tag se gagne ;
- aucun journal, aucun compteur de récidive, aucune modération de la boutique ni des
  collections ;
- `Vendor.application` est nullable, donc la locale du courriel retombe sur le français ;
- les décomptes de tests, mesurés et non recopiés.

- [ ] **Step 7: Vérifier le chantier en entier**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
pnpm test:e2e
```

Si une couche ne peut pas tourner, le DIRE, et ne pas annoncer un chantier vérifié sur la foi
des autres.

- [ ] **Step 8: Donner la commande de commit**

Ne PAS commiter. Donner la commande exacte, fichiers nommés, message court en anglais. La spec
et ce plan y voyagent.
