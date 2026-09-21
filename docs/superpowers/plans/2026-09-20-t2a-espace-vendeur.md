# T2a — L'espace vendeur et sa boutique : plan d'implémentation

> **Pour les exécutants agentiques :** utiliser `superpowers:subagent-driven-development`
> ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes
> emploient la syntaxe à cases (`- [ ]`).

**But :** `apps/vendor` cesse d'être une coquille — un vendeur validé s'y connecte, voit
sa boutique, et corrige ses informations commerciales.

**Architecture :** une garde appelée explicitement en tête de chaque page et de chaque
action serveur, sur la forme de celle de `apps/admin` ; un repository dans `@clemperl/db`
dont la signature exclut physiquement les champs légaux ; un schéma Zod dont les règles
sont **partagées** avec le dossier de candidature plutôt que recopiées.

**Pile :** Next 16 (App Router, server actions, `useActionState`), Prisma 7, Zod 4,
Tailwind 4, Vitest, Jest + Testcontainers, Playwright.

**Spec :** `docs/superpowers/specs/2026-09-20-t2a-espace-vendeur-design.md`

## Contraintes globales

Elles s'appliquent à **chaque** tâche, sans être répétées dans chacune.

- **Le code s'écrit en anglais** : identifiants, noms de fichiers, segments d'URL, clés
  de traduction. **Les commentaires et la documentation s'écrivent en français**, de même
  que les libellés vus par l'utilisateur, qui vivent dans les catalogues de traduction.
- **Un seul commit pour tout le chantier.** `docs/conventions/git.md` l'impose et nomme
  explicitement le piège inverse : les workflows d'agent qui commitent à chaque étape. Le
  document de design et ce plan **ne se commitent pas séparément** — ils partent dans le
  commit final, avec le code. Aucune tâche ci-dessous ne contient d'étape `git commit`,
  sauf la dernière.
- **Les artefacts Git sont en anglais** : message de commit, titre et description de PR,
  nom de branche.
- **La garde est appelée explicitement** en tête de chaque page et de chaque action
  serveur, **jamais posée dans un layout**. Un layout ne s'interpose pas de façon garantie
  devant tout ce qu'il enveloppe.
- **Un fichier `"use server"` ne peut exporter QUE des fonctions asynchrones.** Toute
  constante partagée avec le client va dans un `types/*.interface.ts`. Une constante
  exportée depuis un module `"use server"` arrive `undefined` au client.
- **Toute page lisant la session porte `export const dynamic = "force-dynamic";`**
- **`apps/vendor` est monolingue français**, sans next-intl : il importe
  `@clemperl/i18n/messages/vendor/fr.json` directement, comme `apps/admin`.
- **Les repositories prennent `prisma` en premier paramètre**, n'ont aucun état de module,
  et sont exclus de la couverture Vitest (`packages/db/vitest.config.ts`) : ils sont
  prouvés par la suite Jest d'intégration.
- **Les planchers de couverture sont à 100 %** pour `@clemperl/domain` et `@clemperl/ui`.
  Le cliquet monte, il ne descend jamais : tout code ajouté à ces deux packages doit être
  couvert.
- **Branche de travail :** `feat/vendor-shop`, déjà sortie.

---

### Tâche 1 : Partager les règles des champs commerciaux

Les cinq champs commerciaux ont déjà leurs règles dans le schéma de candidature. Les
recopier dans un second schéma créerait deux dates de divergence. On les **extrait**, et
les deux schémas partagent une définition unique.

**Fichiers :**
- Créer : `packages/domain/src/schemas/shop-profile.schema.ts`
- Créer : `packages/domain/src/schemas/shop-profile.schema.spec.ts`
- Modifier : `packages/domain/src/schemas/application-submission.schema.ts`
- Modifier : `packages/domain/src/schemas/index.ts`

**Interfaces produites :**
- `shopProfileFields` — objet de champs Zod, destiné à être étalé dans un `z.object()`
- `shopProfileSchema: z.ZodObject` — validant `{ shopName, shopDescription, contactEmail, contactPhone, categories }`
- `type TShopProfile = z.infer<typeof shopProfileSchema>`

- [ ] **Étape 1 : écrire le test qui échoue**

`packages/domain/src/schemas/shop-profile.schema.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import { applicationSubmissionSchema } from "./application-submission.schema.js";
import { shopProfileSchema } from "./shop-profile.schema.js";

const VALID = {
    shopName: "Atelier Lumière",
    shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
    contactEmail: "contact@atelier.test",
    contactPhone: "+32470000000",
    categories: ["JEWELLERY" as const],
};

describe("shopProfileSchema", () => {
    it("accepte un profil commercial complet", () => {
        expect(shopProfileSchema.parse(VALID).shopName).toBe("Atelier Lumière");
    });

    // La règle est coûteuse et sa raison est dans le schéma : sans deux caractères
    // latins, le nom ne produit aucun slug, et la deuxième boutique du genre casse sur
    // l'unicité.
    it("refuse un nom sans deux caractères latins", () => {
        expect(shopProfileSchema.safeParse({ ...VALID, shopName: "日本橋工房" }).success).toBe(false);
        expect(shopProfileSchema.safeParse({ ...VALID, shopName: "!!!" }).success).toBe(false);
    });

    it("refuse une liste de catégories vide", () => {
        expect(shopProfileSchema.safeParse({ ...VALID, categories: [] }).success).toBe(false);
    });

    it("coupe les espaces autour du nom", () => {
        expect(shopProfileSchema.parse({ ...VALID, shopName: "  Atelier  " }).shopName).toBe(
            "Atelier",
        );
    });

    // Le point de l'extraction : les deux schémas ne peuvent plus diverger parce qu'il
    // n'y a qu'une définition. Ce test échoue le jour où quelqu'un recopie une règle.
    it("applique au dossier de candidature exactement les mêmes règles commerciales", () => {
        const withLegal = {
            ...VALID,
            shopName: "!!!",
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            locale: "fr" as const,
        };
        expect(applicationSubmissionSchema.safeParse(withLegal).success).toBe(false);
    });
});
```

- [ ] **Étape 2 : lancer le test et constater l'échec**

```
pnpm --filter @clemperl/domain test
```

Attendu : ÉCHEC, `Cannot find module './shop-profile.schema.js'`.

- [ ] **Étape 3 : créer le schéma partagé**

`packages/domain/src/schemas/shop-profile.schema.ts` :

```ts
import { E_VENDOR_CATEGORY } from "@clemperl/db/enums";
import { z } from "zod";

// Les champs COMMERCIAUX d'une boutique — ceux qu'un vendeur corrige lui-même. Partagés
// par le dossier de candidature et par la fiche boutique : une seule définition, donc
// aucune divergence possible entre le moment du dépôt et celui de la correction.
//
// Les énumérations viennent de `@clemperl/db/enums` et non du point d'entrée principal,
// qui entraînerait le client Prisma jusque dans le paquet envoyé au navigateur.
export const shopProfileFields = {
    // Deux caractères latins au moins, sinon le nom ne produit aucun slug et la boutique
    // n'a pas d'identifiant public. « 日本橋工房 » et « !!! » passaient la seule contrainte
    // de longueur et donnaient une chaîne vide, que la deuxième boutique du genre faisait
    // casser sur l'unicité. La place de marché s'adresse à un public francophone : la
    // contrainte est une décision, pas une limite technique.
    shopName: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/(?:[a-zA-Z0-9].*){2}/u, "doit contenir au moins deux caractères latins"),
    shopDescription: z.string().trim().min(20).max(2000),
    contactEmail: z.email(),
    contactPhone: z.string().trim().min(6).max(30),
    categories: z.array(z.enum(E_VENDOR_CATEGORY)).min(1),
};

export const shopProfileSchema = z.object(shopProfileFields);

export type TShopProfile = z.infer<typeof shopProfileSchema>;
```

- [ ] **Étape 4 : faire consommer l'extraction par le schéma de candidature**

Remplacer le contenu de `packages/domain/src/schemas/application-submission.schema.ts`
par :

```ts
import { z } from "zod";
import { shopProfileFields } from "./shop-profile.schema.js";

// Importé par le formulaire ET par la server action. Les champs commerciaux ne sont pas
// redéclarés ici : ils viennent de `shop-profile.schema.ts`, que la fiche boutique
// emploie aussi. Recopier une règle, c'est se donner deux endroits où la changer.
export const applicationSubmissionSchema = z.object({
    ...shopProfileFields,
    legalForm: z.string().trim().min(2).max(60),
    legalName: z.string().trim().min(2).max(160),
    registrationNumber: z.string().trim().min(4).max(40),
    taxNumber: z.string().trim().max(40).optional(),
    country: z.string().trim().length(2).toUpperCase(),
    locale: z.enum(["fr", "en"]),
});

export type TApplicationSubmission = z.infer<typeof applicationSubmissionSchema>;
```

- [ ] **Étape 5 : exporter le nouveau schéma**

`packages/domain/src/schemas/index.ts` :

```ts
export * from "./application-submission.schema.js";
export * from "./shop-profile.schema.js";
```

- [ ] **Étape 6 : vérifier**

```
pnpm --filter @clemperl/domain test
pnpm --filter @clemperl/domain typecheck
```

Attendu : tous les tests passent, **y compris `application-submission.schema.spec.ts`
qui existait déjà** — c'est lui qui prouve que l'extraction n'a rien changé aux règles.
Couverture à 100 %.

---

### Tâche 2 : Un contrôle à cocher dans `@clemperl/ui`

Les catégories sont multiples et le package n'a aucun contrôle à cocher.

**Fichiers :**
- Créer : `packages/ui/src/components/checkbox-field.tsx`
- Créer : `packages/ui/src/components/checkbox-field.spec.tsx`
- Modifier : `packages/ui/src/components/index.ts`

**Interfaces produites :**
- `CheckboxField(props: CheckboxFieldProps): JSX.Element` où
  `CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string }`

- [ ] **Étape 1 : écrire le test qui échoue**

`packages/ui/src/components/checkbox-field.spec.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckboxField } from "./checkbox-field";

describe("CheckboxField", () => {
    // Le libellé doit être ASSOCIÉ au contrôle : c'est ce lien que lisent les lecteurs
    // d'écran, et c'est sur lui que repose `getByLabel` dans la suite Playwright.
    it("associe son libellé au contrôle", () => {
        render(<CheckboxField label="Joaillerie" name="categories" value="JEWELLERY" />);
        expect(screen.getByLabelText("Joaillerie")).toHaveAttribute("value", "JEWELLERY");
    });

    it("rend bien une case à cocher", () => {
        render(<CheckboxField label="Habillement" />);
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("honore `defaultChecked`", () => {
        render(<CheckboxField label="Maroquinerie" defaultChecked />);
        expect(screen.getByRole("checkbox")).toBeChecked();
    });
});
```

- [ ] **Étape 2 : lancer le test et constater l'échec**

```
pnpm --filter @clemperl/ui test
```

Attendu : ÉCHEC, `Failed to resolve import "./checkbox-field"`.

- [ ] **Étape 3 : écrire le composant**

`packages/ui/src/components/checkbox-field.tsx` :

```tsx
import type { InputHTMLAttributes, JSX } from "react";
import { cn } from "../utils";

export interface CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
}

// Le contrôle natif est conservé, pas remplacé par un carré dessiné : il porte déjà son
// rôle, son état coché et la navigation au clavier, et les réimplémenter est la façon
// la plus courante de perdre les trois. Seule sa teinte suit le thème.
export function CheckboxField({ label, className, ...props }: CheckboxFieldProps): JSX.Element {
    return (
        <label className="inline-flex items-center gap-2 text-sm">
            <input
                type="checkbox"
                className={cn("size-4 accent-[--color-texte]", className)}
                {...props}
            />
            <span>{label}</span>
        </label>
    );
}
```

- [ ] **Étape 4 : exporter**

`packages/ui/src/components/index.ts` — ajouter la ligne dans l'ordre alphabétique :

```ts
export * from "./button";
export * from "./checkbox-field";
export * from "./field";
export * from "./file-field";
export * from "./form-section";
```

- [ ] **Étape 5 : vérifier**

```
pnpm --filter @clemperl/ui test
pnpm --filter @clemperl/ui typecheck
```

Attendu : tous les tests passent, couverture à 100 %.

---

### Tâche 3 : Le repository de la boutique

**Fichiers :**
- Créer : `packages/db/src/repositories/vendor.repository.ts`
- Créer : `apps/api/test/vendor-shop.int-spec.ts`
- Modifier : `packages/db/src/repositories/index.ts`

**Interfaces consommées :** aucune des tâches précédentes.

**Interfaces produites :**
- `readVendorForMember(prisma: PrismaClient, userId: string)` — renvoie
  `{ id, slug, shopName, …, members: [{ id, userId, role }] } | null`
- `updateShopProfile(prisma: PrismaClient, input: IUpdateShopProfile)` — renvoie le
  vendeur mis à jour
- `interface IUpdateShopProfile { vendorId: string; shopName: string; shopDescription: string; contactEmail: string; contactPhone: string; categories: TCategory[] }`

- [ ] **Étape 1 : écrire le test d'intégration qui échoue**

`apps/api/test/vendor-shop.int-spec.ts` :

```ts
import { prisma, readVendorForMember, updateShopProfile } from "@clemperl/db";

// Ce que ces fonctions garantissent — qu'un champ légal et le slug ne bougent PAS —
// est une propriété de la base, pas du code appelant. Un client simulé renverrait ce
// qu'on lui a dit de renvoyer.
let counter = 0;

async function createShopWithOwner(): Promise<{ vendorId: string; userId: string; slug: string }> {
    counter += 1;
    const user = await prisma.user.create({
        data: {
            email: `owner-${counter}@clemperl.test`,
            name: "Propriétaire",
            emailVerified: true,
        },
    });
    const vendor = await prisma.vendor.create({
        data: {
            slug: `atelier-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            members: { create: { userId: user.id, role: "OWNER" } },
        },
    });
    return { vendorId: vendor.id, userId: user.id, slug: vendor.slug };
}

describe("readVendorForMember", () => {
    it("retrouve la boutique dont le compte est membre", async () => {
        const { vendorId, userId } = await createShopWithOwner();
        expect((await readVendorForMember(prisma, userId))?.id).toBe(vendorId);
    });

    it("ne renvoie rien pour un compte sans appartenance", async () => {
        counter += 1;
        const stranger = await prisma.user.create({
            data: { email: `stranger-${counter}@clemperl.test`, name: "Passant" },
        });
        expect(await readVendorForMember(prisma, stranger.id)).toBeNull();
    });

    // Une boutique fermée n'est pas une boutique qu'on administre. Sans ce filtre, un
    // ancien vendeur garderait un espace fonctionnel.
    it("ignore une boutique supprimée", async () => {
        const { vendorId, userId } = await createShopWithOwner();
        await prisma.vendor.update({
            where: { id: vendorId },
            data: { deletedAt: new Date() },
        });
        expect(await readVendorForMember(prisma, userId)).toBeNull();
    });
});

describe("updateShopProfile", () => {
    it("enregistre les champs commerciaux", async () => {
        const { vendorId, userId } = await createShopWithOwner();
        await updateShopProfile(prisma, {
            vendorId,
            shopName: "Lumière & Cie",
            shopDescription: "Joaillerie contemporaine, série limitée et sur mesure.",
            contactEmail: "bonjour@lumiere.test",
            contactPhone: "+32470111111",
            categories: ["JEWELLERY", "LEATHER_GOODS"],
        });

        const after = await readVendorForMember(prisma, userId);
        expect(after?.shopName).toBe("Lumière & Cie");
        expect(after?.categories).toEqual(["JEWELLERY", "LEATHER_GOODS"]);
    });

    // Le cœur de la tranche : le slug part dans les URL publiques en T2d, et le légal a
    // été validé contre des pièces. Renommer ne doit toucher ni l'un ni l'autre.
    it("ne touche ni au slug ni aux informations légales", async () => {
        const { vendorId, userId, slug } = await createShopWithOwner();
        await updateShopProfile(prisma, {
            vendorId,
            shopName: "Lumière & Cie",
            shopDescription: "Joaillerie contemporaine, série limitée et sur mesure.",
            contactEmail: "bonjour@lumiere.test",
            contactPhone: "+32470111111",
            categories: ["JEWELLERY"],
        });

        const after = await readVendorForMember(prisma, userId);
        expect(after?.slug).toBe(slug);
        expect(after?.legalName).toBe("Atelier Lumière SRL");
        expect(after?.registrationNumber).toBe("0123456789");
    });
});
```

- [ ] **Étape 2 : lancer le test et constater l'échec**

La suite d'intégration tourne **dans le conteneur `api`**, qui porte le démon Docker
nécessaire à Testcontainers :

```
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand -t 'readVendorForMember'"
```

Attendu : ÉCHEC, `readVendorForMember is not a function`.

- [ ] **Étape 3 : écrire le repository**

`packages/db/src/repositories/vendor.repository.ts` :

```ts
import type { E_VENDOR_CATEGORY } from "../../generated/prisma/enums.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

type TCategory = (typeof E_VENDOR_CATEGORY)[keyof typeof E_VENDOR_CATEGORY];

// Une boutique fermée n'est pas une boutique qu'on administre : `deletedAt` la retire de
// la lecture plutôt que de laisser un ancien vendeur devant un espace fonctionnel.
export async function readVendorForMember(prisma: PrismaClient, userId: string) {
    return prisma.vendor.findFirst({
        where: { deletedAt: null, members: { some: { userId } } },
        include: { members: { select: { id: true, userId: true, role: true } } },
    });
}

// Les champs légaux et le `slug` ne sont pas absents de cette interface par oubli : ils
// en sont exclus pour qu'aucun appelant ne PUISSE les écrire par ce chemin. Une
// vérification à l'entrée s'oublie au prochain appelant ; une signature, non.
export interface IUpdateShopProfile {
    vendorId: string;
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: TCategory[];
}

export async function updateShopProfile(prisma: PrismaClient, input: IUpdateShopProfile) {
    const { vendorId, ...fields } = input;
    return prisma.vendor.update({ where: { id: vendorId }, data: fields });
}
```

- [ ] **Étape 4 : exporter**

`packages/db/src/repositories/index.ts` :

```ts
export * from "./vendor-application.repository.js";
export * from "./vendor.repository.js";
```

- [ ] **Étape 5 : vérifier**

```
pnpm --filter @clemperl/db build
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : les six nouveaux tests passent, **et `vendor-application.int-spec.ts` passe
toujours**.

> **Attention au cache Turbo.** Si `pnpm --filter @clemperl/db build` rend un *cache hit*
> alors qu'un fichier vient d'être ajouté, relancer avec `--force`. Ce cache a déjà
> masqué un fichier manquant pendant T1b : lint, typecheck et test étaient verts sur un
> build antérieur au fichier.

---

### Tâche 4 : La garde, le layout, et la fiche en lecture

Après cette tâche, un vendeur voit sa boutique. Il ne peut encore rien changer.

**Fichiers :**
- Créer : `apps/vendor/src/lib/session.ts`
- Créer : `apps/vendor/src/app/shop/page.tsx`
- Modifier : `apps/vendor/src/app/layout.tsx`
- Modifier : `apps/vendor/src/app/page.tsx`
- Modifier : `apps/vendor/package.json`
- Modifier : `packages/i18n/messages/vendor/fr.json`
- Modifier : `docker/docker-compose.dev.yml`

**Interfaces consommées :** `readVendorForMember` (tâche 3).

**Interfaces produites :**
- `requireVendorMembership(): Promise<{ session, vendor }>` — `vendor` est le retour non
  nul de `readVendorForMember`

- [ ] **Étape 1 : déclarer la dépendance manquante**

`apps/vendor/package.json` — `@clemperl/domain` n'y figure pas, contrairement à
`apps/admin`. L'ajouter dans `dependencies`, en ordre alphabétique :

```json
    "@clemperl/db": "workspace:*",
    "@clemperl/domain": "workspace:*",
    "@clemperl/i18n": "workspace:*",
```

Puis `pnpm install`.

- [ ] **Étape 2 : monter le package dans le conteneur**

`docker/docker-compose.dev.yml`, service `vendor` — il lui manque le montage que le
service `admin` possède déjà. Sans lui, une modification de `@clemperl/domain` n'atteint
pas l'application en développement :

```yaml
    volumes:
      - ../apps/vendor/src:/app/apps/vendor/src
      - ../packages/auth/src:/app/packages/auth/src
      - ../packages/core/src:/app/packages/core/src
      - ../packages/domain/src:/app/packages/domain/src
      - ../packages/ui/src:/app/packages/ui/src
      - ../packages/i18n/messages:/app/packages/i18n/messages
```

- [ ] **Étape 3 : écrire la garde**

`apps/vendor/src/lib/session.ts` :

```ts
import { auth } from "@clemperl/auth";
import { prisma, readVendorForMember } from "@clemperl/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";

// Appelée EXPLICITEMENT en tête de chaque page et de chaque server action, jamais posée
// dans un layout. Un layout ne s'interpose pas de façon garantie devant tout ce qu'il
// enveloppe, et une garde qui SEMBLE protéger est pire qu'une garde absente.
export async function requireVendorMembership() {
    // La connexion vit sur la boutique, et le cookie est partagé : se connecter là vaut
    // ici.
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        redirect(`${STOREFRONT}/sign-in`);
    }

    const vendor = await readVendorForMember(prisma, session.user.id);

    // L'administration répond `notFound()` à un intrus, pour ne pas lui confirmer que la
    // route existe. Ici c'est l'inverse : l'espace vendeur est public par destination,
    // n'importe qui peut en devenir un, et celui qui arrive là est le plus souvent un
    // candidat dont le dossier est encore à l'étude. Un 404 ne protégerait rien et le
    // laisserait devant une porte muette.
    if (!vendor) {
        redirect(`${STOREFRONT}/become-a-vendor`);
    }

    return { session, vendor };
}
```

- [ ] **Étape 4 : écrire la copie**

`packages/i18n/messages/vendor/fr.json` — remplacer le contenu entier :

```json
{
  "home": {
    "title": "Espace vendeur"
  },
  "navigation": {
    "shop": "Ma boutique"
  },
  "shop": {
    "title": "Ma boutique",
    "commercialSection": "Informations commerciales",
    "shopName": "Nom de la boutique",
    "description": "Description",
    "descriptionHint": "Vingt caractères au minimum.",
    "contactEmail": "Adresse e-mail de contact",
    "contactPhone": "Téléphone",
    "categories": "Catégories",
    "save": "Enregistrer",
    "saved": "Vos informations sont enregistrées.",
    "legalSection": "Informations légales",
    "legalNotice": "Ces informations ont été validées avec vos pièces justificatives. Pour les corriger, écrivez à l'administration.",
    "legalForm": "Forme juridique",
    "legalName": "Raison sociale",
    "registrationNumber": "Numéro d'entreprise",
    "taxNumber": "Numéro de TVA",
    "country": "Pays",
    "notProvided": "Non renseigné"
  },
  "category": {
    "APPAREL": "Habillement",
    "JEWELLERY": "Joaillerie",
    "LEATHER_GOODS": "Maroquinerie"
  },
  "errors": {
    "invalid": "Vérifiez les champs signalés.",
    "failed": "L'enregistrement a échoué. Réessayez."
  }
}
```

- [ ] **Étape 5 : construire le layout**

`apps/vendor/src/app/layout.tsx` — il est aujourd'hui `<html><body>{children}</body></html>`,
sans en-tête ni polices. Le remplacer entièrement :

```tsx
import "@clemperl/ui/styles/globals.css";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Archivo, Spectral } from "next/font/google";
import type { JSX, ReactNode } from "react";

// `next/font` auto-héberge les fichiers et les sert depuis notre origine : pas de requête
// vers Google au rendu, et aucun saut de police au chargement.
const titre = Spectral({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--police-titre",
    display: "swap",
});

const interfaceUtilisateur = Archivo({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--police-interface",
    display: "swap",
});

// L'en-tête est STATIQUE : il ne lit ni la session ni la boutique. Un layout ne peut pas
// garder l'accès, donc il n'a rien à faire de données protégées — le nom de la boutique
// est le titre de la page, pas du cadre.
export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
    return (
        <html lang="fr" className={`${titre.variable} ${interfaceUtilisateur.variable}`}>
            <body>
                <header className="border-b border-bordure">
                    <div className="mx-auto flex max-w-3xl items-baseline justify-between px-6 py-5">
                        <a href="/" className="font-titre text-lg tracking-tight">
                            ClemPerl
                        </a>
                        <a href="/shop" className="text-sm text-muet hover:text-texte">
                            {messages.navigation.shop}
                        </a>
                    </div>
                </header>
                {children}
            </body>
        </html>
    );
}
```

- [ ] **Étape 6 : garder l'accueil, et le faire mener à la boutique**

`apps/vendor/src/app/page.tsx` — **ne pas** le remplacer par une redirection.

Cette page affiche l'adresse de la session sous `data-testid="utilisateur"`, et
`e2e/session-sharing.spec.ts` s'en sert pour prouver, sur les TROIS fronts, qu'une
session ouverte sur la boutique vaut ici — y compris le cas « anonyme » après
déconnexion. `e2e/smoke.spec.ts` y lit aussi le titre. L'accueil de l'administration
porte le même rôle et un commentaire qui le dit.

Se contenter d'ajouter le lien vers `/shop`, et le commentaire qui explique pourquoi la
page n'est pas gardée :

```tsx
import { auth } from "@clemperl/auth";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { headers } from "next/headers";
import Link from "next/link";
import type { JSX } from "react";

export const dynamic = "force-dynamic";

// Elle n'est PAS gardée, et c'est délibéré — exactement comme l'accueil de
// l'administration : elle sert à constater qu'une session ouverte sur la boutique vaut
// ici, ce que `e2e/session-sharing.spec.ts` vérifie sur les trois fronts. L'espace
// vendeur lui-même vit sous `/shop`, derrière la garde.
export default async function HomePage(): Promise<JSX.Element> {
    const session = await auth.api.getSession({ headers: await headers() });

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{messages.home.title}</h1>
            <p className="mt-4 text-base text-muet" data-testid="utilisateur">
                {session?.user.email ?? "anonyme"}
            </p>
            <Link
                href="/shop"
                className="mt-8 inline-block text-base underline underline-offset-4"
            >
                {messages.navigation.shop}
            </Link>
        </main>
    );
}
```

- [ ] **Étape 7 : écrire la fiche en lecture**

`apps/vendor/src/app/shop/page.tsx` :

```tsx
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { FormSection } from "@clemperl/ui";
import type { JSX } from "react";
import { requireVendorMembership } from "../../lib/session";

// Cette page lit la session : elle ne peut pas être pré-rendue au build. Sans
// `force-dynamic`, Next sert un rendu figé, et un utilisateur qui vient de se
// déconnecter continue d'y voir ses données.
export const dynamic = "force-dynamic";

const t = messages.shop;
const categories = messages.category as Record<string, string>;

export default async function ShopPage(): Promise<JSX.Element> {
    const { vendor } = await requireVendorMembership();

    // Des tuples DÉCLARÉS, pas un tableau de tableaux : `noUncheckedIndexedAccess` est
    // activé dans `packages/tsconfig/base.json`, et une cellule lue par indice y vaut
    // `string | undefined`.
    const legalRows: readonly (readonly [string, string])[] = [
        [t.legalForm, vendor.legalForm],
        [t.legalName, vendor.legalName],
        [t.registrationNumber, vendor.registrationNumber],
        [t.taxNumber, vendor.taxNumber ?? t.notProvided],
        [t.country, vendor.country],
    ];

    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{vendor.shopName}</h1>

            <div className="mt-12 flex flex-col gap-12">
                <FormSection title={t.legalSection}>
                    <p className="text-sm text-muet">{t.legalNotice}</p>
                    <dl className="flex flex-col gap-3 text-sm">
                        {legalRows.map(([label, value]) => (
                            <div key={label} className="flex justify-between gap-6">
                                <dt className="text-muet">{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </FormSection>

                <p className="text-sm text-muet">
                    {t.categories} :{" "}
                    {vendor.categories.map((category) => categories[category]).join(", ")}
                </p>
            </div>
        </main>
    );
}
```

- [ ] **Étape 8 : vérifier à l'œil, pas seulement au test**

```
pnpm docker:up
```

Ouvrir `http://localhost:3001` avec le compte vendeur créé par la suite e2e existante, et
constater **trois** choses :

1. La racine redirige vers `/shop`
2. La page est **stylée** — polices sérif en titre, filets gris, pas de texte brut noir
   sur blanc à la Times New Roman
3. Un navigateur sans session est renvoyé vers `http://localhost:3000/sign-in`

> **Le point 2 n'est pas décoratif.** Pendant T1b, les utilitaires Tailwind de
> `@clemperl/ui` n'étaient pas générés : la page se rendait, les classes étaient bien sur
> les éléments, elles ne correspondaient à rien — et un test qui affirmait qu'un bouton
> « est visible » passait sur un bouton nu. `apps/vendor` n'a jamais rendu de style :
> c'est la première fois qu'on le vérifie.

---

### Tâche 5 : Rendre les champs commerciaux modifiables

**Fichiers :**
- Créer : `apps/vendor/src/app/shop/types/shop-form-state.interface.ts`
- Créer : `apps/vendor/src/app/shop/actions.ts`
- Créer : `apps/vendor/src/app/shop/shop-form.tsx`
- Modifier : `apps/vendor/src/app/shop/page.tsx`

**Interfaces consommées :** `requireVendorMembership` (tâche 4), `shopProfileSchema`
(tâche 1), `updateShopProfile` (tâche 3), `CheckboxField` (tâche 2).

**Interfaces produites :**
- `interface IShopFormState { message: string[]; saved: boolean }`
- `INITIAL_STATE: IShopFormState`
- `saveShopProfile(previous: IShopFormState, form: FormData): Promise<IShopFormState>`

- [ ] **Étape 1 : poser l'état hors du module serveur**

`apps/vendor/src/app/shop/types/shop-form-state.interface.ts` :

```ts
export interface IShopFormState {
    message: string[];
    saved: boolean;
}

// Cette constante ne peut PAS vivre dans `actions.ts` : un fichier « use server »
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client — l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_STATE: IShopFormState = { message: [], saved: false };
```

- [ ] **Étape 2 : écrire l'action serveur**

`apps/vendor/src/app/shop/actions.ts` :

```ts
"use server";

import { prisma, updateShopProfile } from "@clemperl/db";
import { shopProfileSchema } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../lib/session";
import type { IShopFormState } from "./types/shop-form-state.interface";

export async function saveShopProfile(
    _previous: IShopFormState,
    form: FormData,
): Promise<IShopFormState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas. C'est aussi d'ici que vient le `vendorId` — le
    // formulaire ne le porte pas, pour qu'aucun champ caché ne puisse le désigner.
    const { vendor } = await requireVendorMembership();

    const parsed = shopProfileSchema.safeParse({
        shopName: form.get("shopName"),
        shopDescription: form.get("shopDescription"),
        contactEmail: form.get("contactEmail"),
        contactPhone: form.get("contactPhone"),
        categories: form.getAll("categories"),
    });

    if (!parsed.success) {
        return { message: [messages.errors.invalid], saved: false };
    }

    try {
        await updateShopProfile(prisma, { vendorId: vendor.id, ...parsed.data });
    } catch {
        return { message: [messages.errors.failed], saved: false };
    }

    // `/shop` est une route statique : le chemin littéral suffit. Ce ne serait pas le cas
    // d'un segment dynamique, qui exige le MOTIF et non l'URL rendue.
    revalidatePath("/shop");
    return { message: [], saved: true };
}
```

- [ ] **Étape 3 : écrire le formulaire**

`apps/vendor/src/app/shop/shop-form.tsx` :

```tsx
"use client";

import { Button, CheckboxField, Field, FormSection, TextAreaField } from "@clemperl/ui";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { useActionState, type JSX } from "react";
import { saveShopProfile } from "./actions";
import { INITIAL_STATE } from "./types/shop-form-state.interface";

const CATEGORIES = ["APPAREL", "JEWELLERY", "LEATHER_GOODS"] as const;

interface ShopFormProps {
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: readonly string[];
}

export function ShopForm(shop: ShopFormProps): JSX.Element {
    const t = messages.shop;
    const labels = messages.category as Record<string, string>;
    const [state, action, pending] = useActionState(saveShopProfile, INITIAL_STATE);

    return (
        <form action={action} className="mt-12 flex flex-col gap-12">
            <FormSection title={t.commercialSection}>
                <Field
                    label={t.shopName}
                    name="shopName"
                    required
                    minLength={2}
                    maxLength={80}
                    defaultValue={shop.shopName}
                />
                <TextAreaField
                    label={t.description}
                    name="shopDescription"
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    hint={t.descriptionHint}
                    defaultValue={shop.shopDescription}
                />
                <Field
                    label={t.contactEmail}
                    name="contactEmail"
                    type="email"
                    required
                    defaultValue={shop.contactEmail}
                />
                <Field
                    label={t.contactPhone}
                    name="contactPhone"
                    required
                    defaultValue={shop.contactPhone}
                />
                <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm text-muet">{t.categories}</legend>
                    <div className="flex flex-wrap gap-4">
                        {CATEGORIES.map((category) => (
                            <CheckboxField
                                key={category}
                                label={labels[category] as string}
                                name="categories"
                                value={category}
                                defaultChecked={shop.categories.includes(category)}
                            />
                        ))}
                    </div>
                </fieldset>
            </FormSection>

            {state.message.length > 0 && (
                <p role="alert" className="text-sm text-accent">
                    {state.message.join(" ")}
                </p>
            )}
            {state.saved && <p className="text-sm text-muet">{t.saved}</p>}

            <Button type="submit" disabled={pending}>
                {t.save}
            </Button>
        </form>
    );
}
```

- [ ] **Étape 4 : monter le formulaire dans la page**

`apps/vendor/src/app/shop/page.tsx` — trois modifications :

1. Ajouter l'import `import { ShopForm } from "./shop-form";`
2. **Supprimer** la ligne `const categories = messages.category as Record<string, string>;` :
   les catégories passent dans le formulaire, et une constante de module devenue inutile
   fait échouer le lint
3. Insérer `<ShopForm … />` entre le `h1` et le bloc légal, en retirant la ligne des
   catégories en lecture que la tâche 4 avait posée

Le corps devient :

```tsx
    return (
        <main className="mx-auto max-w-2xl px-6 py-16">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">{vendor.shopName}</h1>

            <ShopForm
                shopName={vendor.shopName}
                shopDescription={vendor.shopDescription}
                contactEmail={vendor.contactEmail}
                contactPhone={vendor.contactPhone}
                categories={vendor.categories}
            />

            <div className="mt-12">
                <FormSection title={t.legalSection}>
                    <p className="text-sm text-muet">{t.legalNotice}</p>
                    <dl className="flex flex-col gap-3 text-sm">
                        {legalRows.map(([label, value]) => (
                            <div key={label} className="flex justify-between gap-6">
                                <dt className="text-muet">{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </FormSection>
            </div>
        </main>
    );
```

- [ ] **Étape 5 : vérifier à la main**

Dans le navigateur, sur `http://localhost:3001/shop` : renommer la boutique, enregistrer,
recharger. Le nouveau nom est là. Vider le champ description et enregistrer : le message
d'erreur français apparaît et **rien n'est écrit**.

---

### Tâche 6 : Raccorder la boutique à l'espace vendeur

L'écran de validation promet aujourd'hui que « votre espace vendeur ouvrira avec la
prochaine tranche ». Laisser cette phrase serait un mensonge qu'aucun test ne signale.

**Fichiers :**
- Modifier : `apps/storefront/src/app/[locale]/(account)/become-a-vendor/components/application-approved.tsx`
- Modifier : `packages/i18n/messages/storefront/fr.json`
- Modifier : `packages/i18n/messages/storefront/en.json`

- [ ] **Étape 1 : changer la copie, dans les deux langues**

`packages/i18n/messages/storefront/fr.json`, sous `vendor.application.approved` :

```json
      "approved": {
        "title": "« {shop} » est validée",
        "next": "Votre espace vendeur est ouvert.",
        "openVendorSpace": "Ouvrir mon espace vendeur"
      }
```

`packages/i18n/messages/storefront/en.json`, au même emplacement :

```json
      "approved": {
        "title": "\"{shop}\" is approved",
        "next": "Your vendor space is open.",
        "openVendorSpace": "Open my vendor space"
      }
```

- [ ] **Étape 2 : poser le lien**

`application-approved.tsx` — remplacer entièrement :

```tsx
import { Button } from "@clemperl/ui";
import { useTranslations } from "next-intl";
import type { JSX } from "react";

const VENDOR = process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "";

interface ApplicationApprovedProps {
    shopName: string;
}

export function ApplicationApproved({ shopName }: ApplicationApprovedProps): JSX.Element {
    const t = useTranslations("vendor.application.approved");

    return (
        <main className="mx-auto max-w-2xl px-6 py-20">
            <h1 className="font-titre text-4xl leading-tight tracking-tight">
                {t("title", { shop: shopName })}
            </h1>
            <p className="mt-6 border-t border-bordure pt-6 text-base text-muet">{t("next")}</p>
            {/* L'espace vendeur est une AUTRE origine : un lien ordinaire, pas le routeur
                de Next, qui ne navigue qu'à l'intérieur de l'application. */}
            <a href={`${VENDOR}/shop`} className="mt-8 inline-block">
                <Button>{t("openVendorSpace")}</Button>
            </a>
        </main>
    );
}
```

- [ ] **Étape 3 : vérifier**

```
pnpm --filter @clemperl/storefront typecheck
```

Attendu : succès. `NEXT_PUBLIC_VENDOR_URL` existe déjà dans `.env.example` (ligne 11) et
dans le compose : aucune variable à ajouter.

---

### Tâche 7 : Le parcours navigateur, la passation, et le commit

**Fichiers :**
- Créer : `e2e/vendor-shop.spec.ts`
- Modifier : `e2e/helpers/accounts.ts`
- Modifier : `e2e/vendor-application.spec.ts`
- Modifier : `docs/passation.md`

**Interfaces consommées :** tout ce qui précède.

**Interfaces produites :**
- `ADMIN_EMAIL: string` et `signInAsAdministrator(page: Page): Promise<void>`, exportés
  par `e2e/helpers/accounts.ts`

- [ ] **Étape 1 : sortir l'ouverture de session administrateur dans le helper**

`vendor-application.spec.ts` porte aujourd'hui `ADMIN_EMAIL` en constante locale et
l'amorçage en ligne. Deux fichiers de test qui amorcent chacun de leur côté se
**courent après** : les fichiers tournent en parallèle, et les deux verraient le bouton
de création visible.

Ajouter à la fin de `e2e/helpers/accounts.ts` :

```ts
export const ADMIN_EMAIL = "administration@clemperl.test";

// Aucun administrateur n'est semé : sur une base neuve, l'instance s'amorce par cette
// page, qui disparaît dès qu'un compte porte le rôle.
//
// La connexion est tentée DANS TOUS LES CAS, et aucune redirection n'est attendue après
// le clic. Deux fichiers de test tournent en parallèle et peuvent voir le bouton de
// création tous les deux : le perdant de la course reçoit « déjà installé » et reste sur
// la page. Se connecter ensuite vaut quel que soit celui qui a créé le compte.
export async function signInAsAdministrator(page: Page): Promise<void> {
    await page.goto(`${URL_ADMIN}/setup`);

    const bootstrap = page.getByRole("button", { name: "Créer l'administrateur" });
    if (await bootstrap.isVisible()) {
        await page.getByLabel("Nom").fill("Administration");
        await page.getByLabel("Adresse e-mail").fill(ADMIN_EMAIL);
        await page.getByLabel("Mot de passe").fill(PASSWORD);
        await bootstrap.click();
    }

    await signInFromPage(page, ADMIN_EMAIL);
}
```

Compléter l'import en tête du fichier, qui ne connaît pas encore `URL_ADMIN` :

```ts
import { URL_ADMIN, URL_MAILPIT, URL_STOREFRONT } from "../../playwright.config";
```

- [ ] **Étape 2 : faire consommer le helper par la suite existante**

Dans `e2e/vendor-application.spec.ts` : supprimer la constante locale `ADMIN_EMAIL`
(ligne 10) et remplacer le bloc d'amorçage — du `await adminPage.goto(`${URL_ADMIN}/setup`)`
jusqu'au `await signInFromPage(adminPage, ADMIN_EMAIL);` — par un seul appel :

```ts
await signInAsAdministrator(adminPage);
```

Ajuster l'import pour prendre `ADMIN_EMAIL` et `signInAsAdministrator` depuis le helper,
et retirer `PASSWORD` s'il n'est plus employé dans le fichier.

> **C'est une modification d'un test déjà prouvé.** Elle est délibérée : sans elle, le
> nouveau fichier duplique l'amorçage et les deux se disputent la création du premier
> administrateur. L'étape 4 rejoue la suite entière pour le vérifier.

- [ ] **Étape 3 : écrire le parcours**

`e2e/vendor-shop.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import { createVerifiedAccount, signInAsAdministrator, signInFromPage } from "./helpers/accounts";

// Sériel : les deux premiers tests partagent l'existence d'un administrateur.
test.describe.configure({ mode: "serial" });

// Ce parcours traverse trois applications et une dizaine d'écrans, dont plusieurs sont
// compilés à la demande au premier passage.
test.setTimeout(180_000);

test("un vendeur validé corrige sa boutique, et le slug ne bouge pas", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const address = `boutique-${suffix}@exemple.test`;
    const shopName = `Atelier ${suffix}`;

    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    // Le dépôt passe par le VRAI formulaire : c'est le seul chemin qui crée une boutique,
    // et un raccourci par la base ne prouverait pas que la garde la retrouve.
    await page.goto(`${URL_STOREFRONT}/become-a-vendor`);
    await page.getByLabel("Nom de la boutique").fill(shopName);
    await page
        .getByLabel("Description")
        .fill("Joaillerie artisanale, pièces uniques montées à la main.");
    await page.getByLabel("Adresse e-mail de contact").fill(address);
    await page.getByLabel("Téléphone de contact").fill("+32470000000");
    await page.getByLabel("Joaillerie").check();
    await page.getByLabel("Forme juridique").fill("SRL");
    await page.getByLabel("Raison sociale").fill(`${shopName} SRL`);
    await page.getByLabel("Numéro d'enregistrement").fill("0123456789");
    await page.getByLabel("Pays (code à deux lettres)").fill("BE");
    await page.getByLabel("Registre de commerce").setInputFiles("e2e/fixtures/registry.pdf");
    await page.getByLabel("Pièce d'identité").setInputFiles("e2e/fixtures/identity.png");
    await page.getByRole("button", { name: "Déposer ma demande" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Votre demande est en cours d'examen",
    );

    // L'administrateur travaille dans un contexte SÉPARÉ : deux sessions dans le même
    // contexte partageraient le cookie et s'écraseraient.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdministrator(adminPage);

    await adminPage.goto(`${URL_ADMIN}/applications`);
    await adminPage.getByRole("link", { name: new RegExp(shopName) }).click();
    await adminPage.getByRole("button", { name: "Accepter" }).click();

    // Critère 3 : l'espace vendeur s'ouvre, et le légal s'y lit sans s'y éditer.
    await page.goto(`${URL_VENDOR}/`);
    await page.waitForURL(`${URL_VENDOR}/shop`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shopName);
    await expect(page.getByText(`${shopName} SRL`)).toBeVisible();
    // Le légal est du texte, pas un champ : aucun contrôle ne porte ce libellé.
    await expect(page.getByLabel("Raison sociale")).toHaveCount(0);

    // Critère 4 : le nom change, le slug non. Le slug n'est affiché nulle part en T2a ;
    // ce qui le prouve est que l'URL de la fiche d'administration reste la même après le
    // renommage.
    const renamed = `${shopName} & Cie`;
    await page.getByLabel("Nom de la boutique").fill(renamed);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Vos informations sont enregistrées.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nom de la boutique")).toHaveValue(renamed);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(renamed);

    // Critère 5 : une saisie invalide est refusée et n'écrit rien.
    await page.getByLabel("Description").fill("trop court");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("main p[role='alert']")).toHaveText(
        "Vérifiez les champs signalés.",
    );

    await adminContext.close();
});

test("un compte sans boutique est renvoyé vers la candidature, pas vers un 404", async ({
    page,
    request,
}) => {
    const address = `sansboutique-${Date.now()}@exemple.test`;
    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.waitForURL(`${URL_STOREFRONT}/**become-a-vendor`);
});

test("un visiteur sans session est renvoyé vers la connexion", async ({ page }) => {
    await page.goto(`${URL_VENDOR}/shop`);
    await page.waitForURL(`${URL_STOREFRONT}/**sign-in`);
});
```

> Le champ « Description » du formulaire de candidature et celui de la fiche boutique
> portent le même libellé, mais ils vivent sur deux applications : aucune ambiguïté de
> sélecteur.

- [ ] **Étape 4 : lancer la suite sur un build de production**

```
pnpm e2e:up
pnpm test:e2e
```

Attendu : les trois nouveaux tests passent, **et les suites existantes aussi** —
`vendor-application.spec.ts` en particulier, qui prouve que l'extraction de la tâche 1
n'a rien changé au dossier de candidature.

> Si un test échoue par intermittence, **instrumenter avant de corriger**. Six
> corrections devinées ont échoué pendant T1b avant qu'une trace du navigateur ne donne
> la cause réelle.

- [ ] **Étape 5 : vérification complète**

```
pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : tout passe. Aucun plancher de couverture n'a été **baissé** — si l'un d'eux
bloque, la réponse est d'écrire le test manquant, jamais d'abaisser le seuil.

- [ ] **Étape 6 : mettre la passation à jour**

`docs/passation.md` :

- Table des tranches : ajouter une ligne `T2a` **Livrée**, et remplacer la ligne `T2` par
  les quatre sous-tranches avec leur état
- Section « Ce qui reste ouvert » : **supprimer** les deux entrées que T2a ferme —
  « Aucun écran ne permet de modifier une boutique validée » et « `apps/vendor` est
  toujours une coquille »
- Ajouter à leur place : « **Les informations légales ne se corrigent nulle part.** Ni le
  vendeur ni l'administration n'ont d'écran pour les changer. Le vendeur les voit en
  lecture et lit où écrire ; côté administration, le chemin reste la base. C'est un vrai
  manque le jour où une société change de forme »
- Ajouter : « **Deux onglets qui enregistrent en même temps : la dernière écriture
  gagne.** Accepté tant qu'une boutique n'a qu'un membre. À rouvrir avec les invitations »
- Mettre à jour la date en tête

- [ ] **Étape 7 : le commit unique**

Un seul commit pour tout le chantier, message en anglais, **spec et plan compris** :

```bash
git add -A
git commit -m "feat(vendor): open the vendor space and let a shop be corrected

A validated vendor now signs in and edits the commercial side of their
shop. The legal fields stay read-only: an administrator approved them
against uploaded documents, and updateShopProfile does not take them —
they are absent from the signature, not filtered out.

The slug is frozen at approval. It becomes a public URL in T2d, so a
rename must not move it.

The shop profile rules are shared with the application schema rather
than copied, so the two cannot drift."
```

- [ ] **Étape 8 : pousser et ouvrir la PR**

```bash
git push -u origin feat/vendor-shop
```

Ouvrir la PR **vers `main`** : CodeRabbit n'accepte que les PR visant la branche par
défaut. Limiter les pushes suivants — la revue gratuite est plafonnée.

---

## Couverture de la spec par les tâches

| Section de la spec | Tâche |
|---|---|
| §5 L'accès, et l'écart avec l'administration | 4 |
| §6 La signature est la garde | 3 |
| §7 La validation sans recopie | 1 |
| §8 L'écran, le layout à construire, le contrôle à ajouter | 2, 4, 5 |
| §9 Le raccordement | 6 |
| §10 Les deux pièges de T1b | 4 (`force-dynamic`), 5 (`"use server"`) |
| §11 Tests | 1, 2, 3, 7 |
| §12 Critères d'acceptation 1–2 | 7 |
| §12 Critère 3 | 4, 5, 7 |
| §12 Critère 4 | 3, 7 |
| §12 Critère 5 | 5, 7 |
| §12 Critère 6 | 6 |
| §12 Critère 7 | 7 |
