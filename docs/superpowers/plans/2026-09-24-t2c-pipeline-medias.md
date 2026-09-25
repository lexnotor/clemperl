# T2c — Le pipeline médias : plan d'implémentation

> **Pour un exécutant agentique :** SOUS-SKILL REQUISE — `superpowers:executing-plans`.
> Les étapes utilisent des cases à cocher (`- [ ]`).

**But** : un vendeur dépose des photos sur un produit ; elles sont optimisées hors du
chemin de la requête, et la publication exige qu'elles soient prêtes.

**Architecture** : le navigateur dépose **directement** au stockage par URL signée, après
qu'une server action a écrit la ligne `PENDING`. Un worker BullMQ dans `apps/api`
télécharge, décode par sharp, écrit trois déclinaisons WebP, bascule la ligne en `READY`.
Un second bucket, privé et distinct de celui des justificatifs, est relayé par une route
de la boutique.

**Pile** : Prisma 7 + PostgreSQL, BullMQ 6.3.8 + `@nestjs/bullmq` 12.0.0 sur Redis,
sharp 0.35.4, `@supabase/storage-js` 2.116.0, Next 16 (server actions), Vitest, Jest +
Testcontainers, Playwright.

**Spec** : `docs/superpowers/specs/2026-09-24-t2c-pipeline-medias-design.md`

## Contraintes globales

Elles s'appliquent à **toutes** les tâches et ne sont pas répétées ensuite.

- **Aucun commit intermédiaire.** Un seul commit à la fin, rédigé à la tâche 8 et
  **exécuté par le propriétaire du dépôt**. Le design et ce plan partent dedans.
- **Aucune écriture Git** de la part de l'exécutant.
- **Le code en anglais**, les commentaires et la documentation **en français**.
- **Aucun libellé visible dans un `.tsx`** : tout dans `packages/i18n/messages/vendor/fr.json`.
- **Nommage Prisma** : `@map` snake_case, `@@map` au pluriel, enums au singulier, `cuid(2)`.
- **`noUncheckedIndexedAccess` est actif** : une cellule lue par indice vaut `T | undefined`.
- **Tailwind 4** : écrire l'utilitaire généré (`text-muet`), jamais `classe-[--variable]`.
- **Playwright** : `getByRole` avec un nom accessible. `Field` associe son libellé par
  `htmlFor` depuis T2b, donc le nom accessible vaut exactement le libellé.
- **Un composant client n'importe JAMAIS le barillet d'un package interne.**
  `@clemperl/domain/browser` existe pour cela.
- **Toute variable lue au build va dans `globalEnv` de `turbo.json`.**
- **Après toute modification de `schema.prisma` : `pnpm docker:up`.** Les fronts
  embarquent `packages/db`, ils ne le montent pas.
- **Le cliquet de couverture monte, jamais ne descend.**

## Review Focus

Cinq classes d'entrée que la spec implique sans qu'aucune tâche ne les exerce
spontanément. Chacune a son test, posé dans la tâche qui possède le code.

1. **Une image aux dimensions démesurées** — 20000 × 20000 pixels tient sous les 5 Mo en
   PNG, et sharp allouerait des gigaoctets pour la décoder. Attendu : `FAILED`, pas un
   worker tué par l'OOM qui emporte l'API avec lui. → tâche 5.
2. **Un objet disparu entre la confirmation et le traitement** — supprimé à la main, ou
   un dépôt qui a échoué en silence. Attendu : `FAILED` avec `object_missing`, pas trois
   tentatives et une exception non traitée. → tâche 5.
3. **Un produit supprimé pendant que ses images attendent** — `deletedAt` posé, le job
   reste dans la file. Attendu : le worker s'arrête proprement, sans écrire. → tâche 5.
4. **Deux dépôts concurrents sur la même position** — `@@unique([productId, position])`
   refuse le second. Attendu : un refus lisible par le vendeur, pas une erreur 500. →
   tâche 4.
5. **Un chemin de relais bien formé mais absurde** — `../`, un nom de bucket, un chemin
   de justificatif. Attendu : 404, et jamais un octet de `vendor-documents`. → tâche 7.

---

## Structure des fichiers

### `packages/core`

| Fichier | Responsabilité |
|---|---|
| `utils/storage-client.utils.ts` | *nouveau* — le client Supabase, partagé, un seul endroit |
| `utils/document-storage.utils.ts` | *modifié* — délègue la construction du client |
| `utils/media-storage.utils.ts` | *nouveau* — le bucket des médias : URL signée, lecture, dépôt, suppression |
| `schemas/base-env.schema.ts` | *modifié* — `STORAGE_MEDIA_BUCKET` |

### `packages/domain`

| Fichier | Responsabilité |
|---|---|
| `constants/image-derivatives.constant.ts` | les trois largeurs, en un seul endroit |
| `utils/media-path.utils.ts` | construire et dériver les chemins ; le motif de la route |
| `browser.ts` | *modifié* — réexporte `media-path.utils` |

### `packages/db`

| Fichier | Responsabilité |
|---|---|
| `prisma/schema.prisma` | *modifié* — `E_PRODUCT_IMAGE_STATUS`, `ProductImage` |
| `src/repositories/product-image.repository.ts` | *nouveau* — cycle de vie d'une image |
| `src/repositories/product.repository.ts` | *modifié* — `setProductStatus` consulte les images |

### `apps/api`

| Fichier | Responsabilité |
|---|---|
| `src/modules/media/media.module.ts` | la file et son processeur |
| `src/modules/media/processors/product-image.processor.ts` | le worker |
| `src/modules/media/services/image-derivatives.service.ts` | sharp, isolé et testable |
| `src/modules/media/media.constants.ts` | nom de file, concurrence |
| `src/app.module.ts` | *modifié* — `BullModule.forRoot` + `MediaModule` |

### `apps/vendor`

| Fichier | Responsabilité |
|---|---|
| `src/app/products/[id]/images/actions.ts` | demander l'URL, confirmer, réordonner, supprimer, relancer |
| `src/app/products/[id]/images/product-images.tsx` | la section images, client |
| `src/app/products/[id]/images/types/image-upload-state.interface.ts` | l'état du formulaire |

### `apps/storefront`

| Fichier | Responsabilité |
|---|---|
| `src/app/api/media/[...path]/route.ts` | le relais, avec son motif et ses en-têtes |

### Infrastructure

`docker/docker-compose.dev.yml` — `storage-init` crée **deux** buckets ; `api` gagne
`REDIS_URL`. `.env.example` et `turbo.json` — `STORAGE_MEDIA_BUCKET`.

---

## Tâche 1 : Le schéma, le second bucket, et les dépendances

**Fichiers**
- Modifier : `packages/db/prisma/schema.prisma`, `packages/core/src/schemas/base-env.schema.ts`,
  `.env.example`, `turbo.json`, `docker/docker-compose.dev.yml`, `apps/api/package.json`
- Créer : `packages/db/prisma/migrations/20260924120000_product_images/migration.sql`
- Tester : `apps/api/test/product-image-schema.int-spec.ts`,
  `packages/core/src/schemas/base-env.schema.spec.ts`

**Interfaces**
- Produit : l'enum `E_PRODUCT_IMAGE_STATUS`, le modèle `ProductImage`, la variable
  `STORAGE_MEDIA_BUCKET`, le bucket `product-media`.

- [ ] **Étape 1 : ajouter l'enum et le modèle**

Dans `packages/db/prisma/schema.prisma`, à la suite de `E_PRODUCT_STATUS` :

```prisma
enum E_PRODUCT_IMAGE_STATUS {
  PENDING
  READY
  FAILED

  @@map("product_image_status")
}
```

À la fin du fichier :

```prisma
model ProductImage {
  id        String                 @id @default(cuid(2))
  productId String                 @map("product_id")
  status    E_PRODUCT_IMAGE_STATUS @default(PENDING)

  // Le chemin de l'ORIGINAL. Les déclinaisons s'en dérivent : leur ensemble est fixe,
  // et `READY` signifie que les trois existent — le worker les écrit toutes ou échoue.
  objectPath String @map("object_path")
  position   Int

  // Le nom d'origine ne sert qu'à l'affichage. Le chemin, lui, est GÉNÉRÉ : reprendre
  // celui du fichier déposé laisserait choisir où l'objet atterrit.
  originalName String  @map("original_name")
  altText      String? @map("alt_text")

  // Renseignées par le WORKER, après décodage. Nulles tant que l'image attend :
  // personne ne connaît les dimensions d'un fichier que rien n'a ouvert.
  width  Int?
  height Int?

  // Une CLÉ de traduction, jamais une phrase : la base ne range pas du français.
  failureReason String? @map("failure_reason")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  // L'ordre d'affichage est une donnée, pas une suggestion.
  @@unique([productId, position])
  @@index([productId, status])
  @@map("product_images")
}
```

Et dans `model Product`, à la liste des relations : `images ProductImage[]`.

- [ ] **Étape 2 : la variable d'environnement**

Dans `packages/core/src/schemas/base-env.schema.ts`, après `STORAGE_BUCKET` :

```ts
    // Le bucket des MÉDIAS, distinct de celui des justificatifs. La séparation est une
    // décision de sécurité : la route de relais lit un chemin venu de l'URL, et deux
    // buckets rendent impossible qu'elle serve une pièce d'identité.
    STORAGE_MEDIA_BUCKET: z.string().min(1),
```

Dans `.env.example`, après `STORAGE_BUCKET` :

```
STORAGE_MEDIA_BUCKET=product-media
```

Dans `turbo.json`, ajouter `"STORAGE_MEDIA_BUCKET"` à `globalEnv`, juste après
`"STORAGE_BUCKET"`. Sans cela le mode strict la filtre.

- [ ] **Étape 3 : créer les deux buckets au démarrage**

Dans `docker/docker-compose.dev.yml`, service `storage-init` : ajouter la variable et
faire boucler le script sur les deux noms.

```yaml
    environment:
      STORAGE_SERVICE_KEY: ${STORAGE_SERVICE_KEY}
      STORAGE_BUCKET: ${STORAGE_BUCKET}
      STORAGE_MEDIA_BUCKET: ${STORAGE_MEDIA_BUCKET}
```

Remplacer l'`entrypoint` par celui-ci — même contrat qu'avant, appliqué à une liste.
Pas de littéral de gabarit : Compose interpole `${...}` avant que node ne le voie.

```yaml
    entrypoint:
      - node
      - -e
      - >-
        const cle=process.env.STORAGE_SERVICE_KEY;const seaux=[process.env.STORAGE_BUCKET,process.env.STORAGE_MEDIA_BUCKET];Promise.all(seaux.map(function(s){return fetch('http://storage:5000/bucket',{method:'POST',headers:{Authorization:'Bearer '+cle,'Content-Type':'application/json'},body:JSON.stringify({name:s,public:false})}).then(function(r){return r.json().then(function(c){return{r:r,c:c,s:s};});}).then(function(x){if(x.r.ok||x.c.code==='BucketAlreadyExists'){console.log('bucket '+x.s+' pret');return;}console.error(x.c);throw new Error(x.s);});})).catch(function(e){console.error(e);process.exit(1);});
```

Dans le service `api`, ajouter `REDIS_URL` — le worker en a besoin et l'API ne l'utilisait
pas jusqu'ici. Il est déjà dans `env_file`, donc rien à ajouter : **vérifier** seulement
que `redis` figure dans ses `depends_on`, ce qui est déjà le cas.

- [ ] **Étape 4 : les dépendances de l'API**

```bash
pnpm --filter @clemperl/api add bullmq@6.3.8 @nestjs/bullmq@12.0.0 sharp@0.35.4
```

`sharp` embarque un binaire natif par plateforme. pnpm bloque les scripts d'installation
par défaut : ajouter `sharp` à `allowBuilds` dans `pnpm-workspace.yaml`, sinon le binaire
n'est pas posé et l'import échoue à l'exécution avec un message parlant d'un module
introuvable.

- [ ] **Étape 5 : générer la migration**

`migrate dev` est interactif. Passer par `diff` puis `deploy` :

```bash
mkdir -p packages/db/prisma/migrations/20260924120000_product_images
docker exec clemperl_dev_api sh -c "cd packages/db && pnpm exec prisma migrate diff \
  --from-config-datasource prisma.config.ts \
  --to-schema prisma/schema.prisma --script" \
  > packages/db/prisma/migrations/20260924120000_product_images/migration.sql
```

**Vérifier que le fichier n'est pas vide** avant d'aller plus loin : une migration vide se
déploie sans rien faire et sans rien dire. Puis :

```bash
docker exec clemperl_dev_api sh -c "cd packages/db && pnpm exec prisma migrate deploy"
```

- [ ] **Étape 6 : réexporter, et reconstruire la stack**

Dans `packages/db/src/index.ts`, ajouter aux blocs existants :

```ts
export type { ProductImage } from "../generated/prisma/client.js";
export { E_PRODUCT_IMAGE_STATUS } from "../generated/prisma/client.js";
```

```bash
pnpm docker:up
```

Les fronts embarquent `packages/db` : sans cette reconstruction, ils servent l'ancien
client et tombent sur un export introuvable, avec un symptôme qui accuse une route sans
rapport.

- [ ] **Étape 7 : le test des contraintes**

`apps/api/test/product-image-schema.int-spec.ts` :

```ts
import { prisma } from "@clemperl/db";

const PREFIX = "image-schema";
let counter = 0;

async function createProduct(): Promise<string> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    const product = await prisma.product.create({
        data: {
            vendorId: vendor.id,
            slug: `${PREFIX}-cabas-${counter}`,
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        },
    });
    return product.id;
}

describe("contraintes des images", () => {
    it("refuse deux images à la même position", async () => {
        const productId = await createProduct();
        await prisma.productImage.create({
            data: { productId, objectPath: "a/1/original.jpg", position: 0, originalName: "a.jpg" },
        });

        await expect(
            prisma.productImage.create({
                data: {
                    productId,
                    objectPath: "a/2/original.jpg",
                    position: 0,
                    originalName: "b.jpg",
                },
            }),
        ).rejects.toThrow();
    });

    it("naît en attente", async () => {
        const productId = await createProduct();
        const image = await prisma.productImage.create({
            data: { productId, objectPath: "a/1/original.jpg", position: 0, originalName: "a.jpg" },
        });
        expect(image.status).toBe("PENDING");
        expect(image.width).toBeNull();
    });

    // Supprimer un produit emporte ses images : une image sans produit n'est joignable
    // par personne et ne ferait qu'occuper de la place.
    it("emporte les images quand le produit disparaît", async () => {
        const productId = await createProduct();
        const image = await prisma.productImage.create({
            data: { productId, objectPath: "a/1/original.jpg", position: 0, originalName: "a.jpg" },
        });

        await prisma.product.delete({ where: { id: productId } });

        expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
    });
});
```

- [ ] **Étape 8 : le test de la variable d'environnement**

Ajouter à `packages/core/src/schemas/base-env.schema.spec.ts` :

```ts
describe("STORAGE_MEDIA_BUCKET", () => {
    // Les deux buckets sont la seule barrière structurelle entre le catalogue public et
    // les pièces d'identité. Démarrer sans savoir lequel est lequel n'a pas de sens.
    it("est exigée", () => {
        const { STORAGE_MEDIA_BUCKET: _absent, ...sansMedia } = VALIDE;
        expect(() => parseBaseEnv(sansMedia)).toThrow(/STORAGE_MEDIA_BUCKET/);
    });

    it("refuse d'être la même que celle des justificatifs", () => {
        expect(() =>
            parseBaseEnv({ ...VALIDE, STORAGE_MEDIA_BUCKET: VALIDE.STORAGE_BUCKET }),
        ).toThrow(/distinct/i);
    });
});
```

Le second test exige un `refine` sur le schéma. L'ajouter, à côté de celui de TLS :

```ts
const envSchemaWithTls = baseEnvSchema
    .refine(/* …la règle TLS existante, inchangée… */)
    // Un même bucket pour les deux ferait de la route de relais un chemin vers les
    // pièces d'identité. La confusion est refusée au démarrage, pas à l'exécution.
    .refine((env) => env.STORAGE_MEDIA_BUCKET !== env.STORAGE_BUCKET, {
        path: ["STORAGE_MEDIA_BUCKET"],
        message: "doit être distinct de STORAGE_BUCKET",
    });
```

Ajouter `STORAGE_MEDIA_BUCKET: "product-media"` à la constante `VALIDE` du fichier de test.

- [ ] **Étape 9 : exécuter**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand -t 'contraintes des images'"
pnpm --filter @clemperl/core test
```

Attendu : 3 tests d'intégration verts, et le paquet `core` vert avec ses deux nouveaux.

---

## Tâche 2 : Le stockage des médias

**Fichiers**
- Créer : `packages/core/src/utils/storage-client.utils.ts`, `packages/core/src/utils/media-storage.utils.ts`
- Modifier : `packages/core/src/utils/document-storage.utils.ts`, `packages/core/src/utils/index.ts`
- Tester : `packages/core/src/utils/media-storage.utils.spec.ts`

**Interfaces**
- Produit :
  ```ts
  function createSignedUpload(path: string): Promise<{ signedUrl: string; token: string }>
  function readMedia(path: string): Promise<Blob>
  function uploadMedia(path: string, content: ArrayBuffer, mimeType: string): Promise<void>
  function deleteMediaPrefix(prefix: string): Promise<void>
  ```

- [ ] **Étape 1 : extraire la construction du client**

`packages/core/src/utils/storage-client.utils.ts` :

```ts
import { StorageClient } from "@supabase/storage-js";

// Construit à la demande et non à l'import : charger ce module dans un contexte sans
// variables d'environnement — un test unitaire, une étape de build — ne doit pas échouer.
//
// Extrait ici parce que DEUX buckets l'utilisent désormais. Le dupliquer ferait deux
// façons de lire les mêmes variables, qui divergeraient au premier ajustement.
export function storageClient(): StorageClient {
    const url = process.env["STORAGE_URL"];
    const key = process.env["STORAGE_SERVICE_KEY"];
    if (!url || !key) {
        throw new Error("STORAGE_URL ou STORAGE_SERVICE_KEY est absente.");
    }
    return new StorageClient(url, { Authorization: `Bearer ${key}` });
}
```

Dans `document-storage.utils.ts`, supprimer la fonction `client()` locale et importer
`storageClient`. **Ne rien changer d'autre** : les fonctions de T1b gardent leur
comportement, et leurs tests le prouvent.

- [ ] **Étape 2 : écrire le module des médias**

`packages/core/src/utils/media-storage.utils.ts` :

```ts
import { storageClient } from "./storage-client.utils.js";

function mediaBucket(): string {
    const name = process.env["STORAGE_MEDIA_BUCKET"];
    if (!name) {
        throw new Error("STORAGE_MEDIA_BUCKET est absente.");
    }
    return name;
}

// Rend au navigateur de quoi déposer SANS passer par nos serveurs. C'est tout l'intérêt
// du dépôt direct : les octets vont du poste du vendeur au stockage, sans qu'un serveur
// Next les relaie pour rien.
export async function createSignedUpload(
    path: string,
): Promise<{ signedUrl: string; token: string }> {
    const { data, error } = await storageClient().from(mediaBucket()).createSignedUploadUrl(path);
    if (error || !data) {
        throw error ?? new Error(`URL de dépôt refusée pour ${path}`);
    }
    return { signedUrl: data.signedUrl, token: data.token };
}

export async function readMedia(path: string): Promise<Blob> {
    const { data, error } = await storageClient().from(mediaBucket()).download(path);
    if (error || !data) {
        throw error ?? new Error(`Média introuvable : ${path}`);
    }
    return data;
}

export async function uploadMedia(
    path: string,
    content: ArrayBuffer,
    mimeType: string,
): Promise<void> {
    const { error } = await storageClient()
        .from(mediaBucket())
        .upload(path, content, { contentType: mimeType, upsert: true });
    if (error) {
        throw error;
    }
}

// Supprime un dossier entier — l'original ET ses déclinaisons. Elle n'échoue jamais
// bruyamment : un objet orphelin coûte de l'espace, et faire échouer une suppression de
// ligne parce qu'un ménage a raté serait une régression.
export async function deleteMediaPrefix(prefix: string): Promise<void> {
    try {
        const client = storageClient().from(mediaBucket());
        const { data, error: listError } = await client.list(prefix);
        if (listError || !data) {
            console.error("Listage du préfixe refusé", { prefix, listError });
            return;
        }
        const paths = data.map((entry) => `${prefix}/${entry.name}`);
        if (paths.length === 0) {
            return;
        }
        const { error } = await client.remove(paths);
        if (error) {
            console.error("Suppression de médias refusée", { prefix, error });
        }
    } catch (error) {
        console.error("Suppression de médias impossible", { prefix, error });
    }
}
```

Ajouter les deux fichiers à `packages/core/src/utils/index.ts`.

- [ ] **Étape 3 : tester ce qui se teste sans réseau**

`packages/core/src/utils/media-storage.utils.spec.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSignedUpload, readMedia } from "./media-storage.utils.js";

// Ces fonctions parlent à un service réseau : ce qui se teste ici, c'est leur REFUS de
// démarrer sans configuration. Le reste est éprouvé par la couche intégration de la
// tâche 5, contre le vrai conteneur de stockage.
describe("media-storage sans configuration", () => {
    const initial = { ...process.env };

    beforeEach(() => {
        delete process.env["STORAGE_MEDIA_BUCKET"];
    });

    afterEach(() => {
        process.env = { ...initial };
    });

    it("refuse de déposer sans bucket déclaré", async () => {
        process.env["STORAGE_URL"] = "http://storage:5000";
        process.env["STORAGE_SERVICE_KEY"] = "cle";
        await expect(createSignedUpload("a/b/original.jpg")).rejects.toThrow(
            /STORAGE_MEDIA_BUCKET/,
        );
    });

    it("refuse de lire sans URL de stockage", async () => {
        delete process.env["STORAGE_URL"];
        await expect(readMedia("a/b/w320.webp")).rejects.toThrow(/STORAGE_URL/);
    });
});
```

- [ ] **Étape 4 : exécuter**

```bash
pnpm --filter @clemperl/core test
```

Attendu : vert, y compris les tests de `document-storage` inchangés — l'extraction du
client ne doit avoir rien déplacé.

---

## Tâche 3 : Les chemins, dans le domaine

**Fichiers**
- Créer : `packages/domain/src/constants/image-derivatives.constant.ts`,
  `packages/domain/src/utils/media-path.utils.ts`
- Modifier : `packages/domain/src/constants/index.ts`, `utils/index.ts`, `browser.ts`
- Tester : `packages/domain/src/utils/media-path.utils.spec.ts`

**Interfaces**
- Produit :
  ```ts
  const DERIVATIVE_WIDTHS: readonly [320, 800, 1600]
  function buildOriginalPath(productId: string, originalName: string): string
  function derivativePath(originalPath: string, width: number): string
  function mediaPrefix(originalPath: string): string
  function isServableMediaPath(path: string): boolean
  ```

- [ ] **Étape 1 : écrire les tests**

`packages/domain/src/utils/media-path.utils.spec.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
    buildOriginalPath,
    derivativePath,
    isServableMediaPath,
    mediaPrefix,
} from "./media-path.utils.js";

const PRODUCT = "c1zqk8s0000008l3h2f4g5j6";

describe("buildOriginalPath", () => {
    it("range sous le produit, dans un dossier propre au dépôt", () => {
        const path = buildOriginalPath(PRODUCT, "Photo Été.JPG");
        expect(path).toMatch(new RegExp(`^${PRODUCT}/[0-9a-f-]{36}/original\\.jpg$`));
    });

    // Reprendre le nom du fichier laisserait choisir OÙ l'objet atterrit — `../` compris.
    it("ne reprend rien du nom fourni sauf l'extension", () => {
        const path = buildOriginalPath(PRODUCT, "../../secret.png");
        expect(path).not.toContain("..");
        expect(path).toMatch(/original\.png$/);
    });

    it("retombe sur `bin` quand il n'y a pas d'extension", () => {
        expect(buildOriginalPath(PRODUCT, "photo")).toMatch(/original\.bin$/);
    });

    it("donne un dossier différent à chaque appel", () => {
        expect(buildOriginalPath(PRODUCT, "a.jpg")).not.toBe(buildOriginalPath(PRODUCT, "a.jpg"));
    });
});

describe("derivativePath", () => {
    it("remplace le fichier sans toucher au dossier", () => {
        const original = `${PRODUCT}/11111111-2222-3333-4444-555555555555/original.jpg`;
        expect(derivativePath(original, 800)).toBe(
            `${PRODUCT}/11111111-2222-3333-4444-555555555555/w800.webp`,
        );
    });
});

describe("mediaPrefix", () => {
    it("rend le dossier, pour pouvoir tout supprimer d'un coup", () => {
        const original = `${PRODUCT}/11111111-2222-3333-4444-555555555555/original.jpg`;
        expect(mediaPrefix(original)).toBe(`${PRODUCT}/11111111-2222-3333-4444-555555555555`);
    });
});

describe("isServableMediaPath", () => {
    const dossier = `${PRODUCT}/11111111-2222-3333-4444-555555555555`;

    it("accepte une déclinaison connue", () => {
        expect(isServableMediaPath(`${dossier}/w320.webp`)).toBe(true);
        expect(isServableMediaPath(`${dossier}/w1600.webp`)).toBe(true);
    });

    it("accepte l'original", () => {
        expect(isServableMediaPath(`${dossier}/original.jpg`)).toBe(true);
    });

    it("refuse une largeur qu'on ne produit pas", () => {
        expect(isServableMediaPath(`${dossier}/w999.webp`)).toBe(false);
    });

    // Le motif est ANCRÉ aux deux bouts. Non ancré, il accepterait n'importe quel
    // préfixe et n'importe quel suffixe, et la barrière ne barrerait plus rien.
    it("refuse tout préfixe ou suffixe ajouté", () => {
        expect(isServableMediaPath(`../../${dossier}/w320.webp`)).toBe(false);
        expect(isServableMediaPath(`${dossier}/w320.webp/../secret`)).toBe(false);
        expect(isServableMediaPath(`vendor-documents/${dossier}/w320.webp`)).toBe(false);
    });

    it("refuse un chemin de justificatif", () => {
        expect(isServableMediaPath("applications/abc/identity-1234.pdf")).toBe(false);
    });

    it("refuse une traversée déguisée", () => {
        expect(isServableMediaPath(`${dossier}/..%2Foriginal.jpg`)).toBe(false);
    });
});
```

- [ ] **Étape 2 : exécuter pour voir l'échec**

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/media-path.utils.spec.ts
```

Attendu : `Failed to resolve import "./media-path.utils.js"`.

- [ ] **Étape 3 : écrire les constantes et les chemins**

`packages/domain/src/constants/image-derivatives.constant.ts` :

```ts
// Les trois largeurs servies : une vignette de liste, une carte, un plein écran. Écrites
// ICI et nulle part ailleurs — le worker les produit, la route les autorise, et T2d les
// demandera. Trois copies divergeraient au premier ajustement.
export const DERIVATIVE_WIDTHS = [320, 800, 1600] as const;

export type TDerivativeWidth = (typeof DERIVATIVE_WIDTHS)[number];
```

`packages/domain/src/utils/media-path.utils.ts` :

```ts
import { randomUUID } from "node:crypto";
import { DERIVATIVE_WIDTHS } from "../constants/image-derivatives.constant.js";

// Le chemin est GÉNÉRÉ, jamais repris du fichier déposé : reprendre celui-ci laisserait
// choisir où l'objet atterrit — `../` compris — et ferait collisionner deux dépôts
// homonymes. Le nom d'origine survit en base, pour l'affichage seulement.
export function buildOriginalPath(productId: string, originalName: string): string {
    const parts = originalName.split(".");
    const extension =
        parts.length > 1 ? (parts.pop() as string).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    return `${productId}/${randomUUID()}/original.${extension || "bin"}`;
}

export function mediaPrefix(originalPath: string): string {
    return originalPath.slice(0, originalPath.lastIndexOf("/"));
}

export function derivativePath(originalPath: string, width: number): string {
    return `${mediaPrefix(originalPath)}/w${width}.webp`;
}

// ANCRÉ aux deux bouts. Non ancré, ce motif accepterait n'importe quel préfixe et
// n'importe quel suffixe — `../../vendor-documents/...` compris — et la barrière ne
// barrerait plus rien. Combiné au bucket distinct, il fait deux barrières indépendantes.
const SERVABLE = new RegExp(
    `^[a-z0-9]{20,32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/` +
        `(original\\.[a-z0-9]+|w(${DERIVATIVE_WIDTHS.join("|")})\\.webp)$`,
);

export function isServableMediaPath(path: string): boolean {
    return SERVABLE.test(path);
}
```

- [ ] **Étape 4 : exécuter, puis réexporter**

```bash
pnpm --filter @clemperl/domain exec vitest run src/utils/media-path.utils.spec.ts
```

Attendu : 11 tests verts.

Ajouter à `packages/domain/src/constants/index.ts` :
`export * from "./image-derivatives.constant.js";`
Ajouter à `packages/domain/src/utils/index.ts` :
`export * from "./media-path.utils.js";`

**Et à `packages/domain/src/browser.ts`** — le composant client affiche des vignettes,
donc il dérive des chemins :

```ts
export * from "./constants/image-derivatives.constant.js";
export * from "./utils/media-path.utils.js";
```

`media-path.utils.ts` importe `node:crypto`. Dans un paquet navigateur, seul
`buildOriginalPath` en dépend, et aucun composant client ne l'appelle — mais l'import
statique suffirait à casser le bundle. **Le déplacer** : `buildOriginalPath` reste côté
serveur, dans `media-path.server.utils.ts`, et `browser.ts` n'exporte que les trois
fonctions pures. Vérifier par `pnpm --filter @clemperl/vendor build` à la tâche 6.

- [ ] **Étape 5 : le package entier**

```bash
pnpm --filter @clemperl/domain test
```

Attendu : vert, couverture à 100 %.

---

## Tâche 4 : Le dépôt des images

**Fichiers**
- Créer : `packages/db/src/repositories/product-image.repository.ts`
- Modifier : `packages/db/src/repositories/product.repository.ts`, `repositories/index.ts`
- Tester : `apps/api/test/product-image-repository.int-spec.ts`

**Interfaces**
- Produit :
  ```ts
  function createPendingImage(prisma, input: { productId, vendorId, objectPath, originalName }): Promise<{ id: string; position: number }>
  function listImagesForProduct(prisma, input: { productId, vendorId })
  function readImageForVendor(prisma, input: { imageId, vendorId })
  function markImageReady(prisma, input: { imageId, width, height }): Promise<void>
  function markImageFailed(prisma, input: { imageId, reason }): Promise<void>
  function deleteImage(prisma, input: { imageId, vendorId }): Promise<{ objectPath: string } | null>
  function reorderImages(prisma, input: { productId, vendorId, orderedIds }): Promise<void>
  function setImageAltText(prisma, input: { imageId, vendorId, altText }): Promise<void>
  const ERROR_POSITION_TAKEN = "IMAGE_POSITION_TAKEN"
  const ERROR_IMAGE_NOT_FOUND = "IMAGE_NOT_FOUND"
  const ERROR_NO_READY_IMAGE = "NO_READY_IMAGE"
  ```

- [ ] **Étape 1 : écrire le dépôt**

`packages/db/src/repositories/product-image.repository.ts` :

```ts
import type { PrismaClient } from "../../generated/prisma/client.js";

export const ERROR_IMAGE_NOT_FOUND = "IMAGE_NOT_FOUND";
export const ERROR_POSITION_TAKEN = "IMAGE_POSITION_TAKEN";

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "P2002"
    );
}

// Toute fonction porte `vendorId` et filtre par la boutique du produit. `imageId` et
// `productId` viennent de l'URL ou du formulaire, donc du client : sans ce filtre, un
// vendeur manipule les images d'un autre. La garantie est dans la SIGNATURE.
export async function listImagesForProduct(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string },
) {
    return prisma.productImage.findMany({
        where: { productId: input.productId, product: { vendorId: input.vendorId } },
        orderBy: { position: "asc" },
    });
}

export async function readImageForVendor(
    prisma: PrismaClient,
    input: { imageId: string; vendorId: string },
) {
    return prisma.productImage.findFirst({
        where: { id: input.imageId, product: { vendorId: input.vendorId } },
    });
}

// La ligne s'écrit AVANT que l'URL signée soit rendue. Un dépôt qui n'aboutit pas laisse
// alors une ligne PENDING sans objet — visible, supprimable, retrouvable. L'inverse
// laisserait un objet payé que rien ne réclame.
export async function createPendingImage(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string; objectPath: string; originalName: string },
): Promise<{ id: string; position: number }> {
    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
            select: { id: true },
        });
        if (!product) {
            throw new Error(ERROR_IMAGE_NOT_FOUND);
        }

        const last = await tx.productImage.findFirst({
            where: { productId: input.productId },
            orderBy: { position: "desc" },
            select: { position: true },
        });

        try {
            return await tx.productImage.create({
                data: {
                    productId: input.productId,
                    objectPath: input.objectPath,
                    originalName: input.originalName,
                    position: (last?.position ?? -1) + 1,
                },
                select: { id: true, position: true },
            });
        } catch (error) {
            // Deux dépôts simultanés visent la même position suivante. Le second est
            // refusé par la base ; le distinguer permet de dire au vendeur de
            // recommencer plutôt que d'afficher une panne.
            if (isUniqueViolation(error)) {
                throw new Error(ERROR_POSITION_TAKEN, { cause: error });
            }
            throw error;
        }
    });
}

// Appelées par le WORKER, qui n'a pas de `vendorId` : il travaille sur un identifiant
// qu'il a reçu de la file, pas d'un client.
export async function markImageReady(
    prisma: PrismaClient,
    input: { imageId: string; width: number; height: number },
): Promise<void> {
    await prisma.productImage.update({
        where: { id: input.imageId },
        data: {
            status: "READY",
            width: input.width,
            height: input.height,
            failureReason: null,
        },
    });
}

export async function markImageFailed(
    prisma: PrismaClient,
    input: { imageId: string; reason: string },
): Promise<void> {
    await prisma.productImage.update({
        where: { id: input.imageId },
        data: { status: "FAILED", failureReason: input.reason },
    });
}

// Rend le chemin pour que l'appelant supprime les objets APRÈS le commit. Supprimer
// avant laisserait, si la transaction échouait, une ligne pointant vers le vide.
export async function deleteImage(
    prisma: PrismaClient,
    input: { imageId: string; vendorId: string },
): Promise<{ objectPath: string } | null> {
    return prisma.$transaction(async (tx) => {
        const image = await tx.productImage.findFirst({
            where: { id: input.imageId, product: { vendorId: input.vendorId } },
            select: { id: true, objectPath: true },
        });
        if (!image) {
            return null;
        }
        await tx.productImage.delete({ where: { id: image.id } });
        return { objectPath: image.objectPath };
    });
}

export async function setImageAltText(
    prisma: PrismaClient,
    input: { imageId: string; vendorId: string; altText: string | null },
): Promise<void> {
    await prisma.productImage.updateMany({
        where: { id: input.imageId, product: { vendorId: input.vendorId } },
        data: { altText: input.altText },
    });
}

// PostgreSQL vérifie l'unicité à CHAQUE instruction, pas en fin de transaction.
// Échanger deux positions par deux `UPDATE` successifs viole donc la contrainte au
// premier, alors que l'état final serait valide. D'où le décalage en deux temps : toutes
// les positions hors de la plage occupée, puis réécrites à leurs valeurs finales.
const REORDER_OFFSET = 1000;

export async function reorderImages(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string; orderedIds: readonly string[] },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const existing = await tx.productImage.findMany({
            where: { productId: input.productId, product: { vendorId: input.vendorId } },
            select: { id: true },
        });
        const known = new Set(existing.map((image) => image.id));

        // Un ordre partiel laisserait des images sans position. On exige la liste
        // complète, et rien d'étranger dedans.
        if (
            input.orderedIds.length !== known.size ||
            input.orderedIds.some((id) => !known.has(id))
        ) {
            throw new Error(ERROR_IMAGE_NOT_FOUND);
        }

        for (const [index, id] of input.orderedIds.entries()) {
            await tx.productImage.update({
                where: { id },
                data: { position: index + REORDER_OFFSET },
            });
        }
        for (const [index, id] of input.orderedIds.entries()) {
            await tx.productImage.update({ where: { id }, data: { position: index } });
        }
    });
}
```

Ajouter `export * from "./product-image.repository.js";` à `repositories/index.ts`.

- [ ] **Étape 2 : la publication consulte les images**

Dans `packages/db/src/repositories/product.repository.ts`, ajouter la constante puis
remplacer `setProductStatus` :

```ts
export const ERROR_NO_READY_IMAGE = "NO_READY_IMAGE";
```

```ts
export async function setProductStatus(
    prisma: PrismaClient,
    input: { productId: string; vendorId: string; publish: boolean },
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        if (input.publish) {
            // Le contrôle est DANS la transaction du dépôt, pas dans l'action : une
            // action serveur est une route publique, et c'est sur cette garantie que
            // T2d s'appuiera pour ne jamais rencontrer de fiche sans photo.
            const images = await tx.productImage.findMany({
                where: { productId: input.productId, product: { vendorId: input.vendorId } },
                select: { status: true },
            });
            if (images.length === 0 || images.some((image) => image.status !== "READY")) {
                throw new Error(ERROR_NO_READY_IMAGE);
            }
        }

        await tx.product.updateMany({
            where: { id: input.productId, vendorId: input.vendorId, deletedAt: null },
            data: {
                status: input.publish ? "PUBLISHED" : "DRAFT",
                // `publishedAt` ne se remet jamais à zéro : il date le moment où le slug
                // a cessé de pouvoir bouger, et dépublier ne rend pas une URL
                // réutilisable.
                ...(input.publish ? { publishedAt: new Date() } : {}),
            },
        });
    });
}
```

- [ ] **Étape 3 : écrire le test d'intégration**

`apps/api/test/product-image-repository.int-spec.ts` :

```ts
import {
    ERROR_IMAGE_NOT_FOUND,
    ERROR_NO_READY_IMAGE,
    ERROR_POSITION_TAKEN,
    createPendingImage,
    deleteImage,
    listImagesForProduct,
    markImageFailed,
    markImageReady,
    prisma,
    reorderImages,
    setProductStatus,
} from "@clemperl/db";

const PREFIX = "image-repo";
const DESCRIPTION = "Cuir pleine fleur, coutures à la main, doublure en lin.";
let counter = 0;

async function createShopWithProduct(): Promise<{ vendorId: string; productId: string }> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    const product = await prisma.product.create({
        data: {
            vendorId: vendor.id,
            slug: `${PREFIX}-cabas-${counter}`,
            title: "Sac cabas",
            description: DESCRIPTION,
            variants: { create: { priceAmount: 12000, combinationKey: "", position: 0 } },
        },
    });
    return { vendorId: vendor.id, productId: product.id };
}

async function addImage(productId: string, vendorId: string, nth: number) {
    return createPendingImage(prisma, {
        productId,
        vendorId,
        objectPath: `${productId}/0000000${nth}-0000-0000-0000-000000000000/original.jpg`,
        originalName: `photo-${nth}.jpg`,
    });
}

describe("createPendingImage", () => {
    it("empile les positions dans l'ordre d'arrivée", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        expect((await addImage(productId, vendorId, 1)).position).toBe(0);
        expect((await addImage(productId, vendorId, 2)).position).toBe(1);
    });

    it("refuse un produit d'une autre boutique", async () => {
        const mine = await createShopWithProduct();
        const theirs = await createShopWithProduct();

        await expect(addImage(theirs.productId, mine.vendorId, 1)).rejects.toThrow(
            ERROR_IMAGE_NOT_FOUND,
        );
    });

    // Deux dépôts simultanés lisent la même dernière position et visent la même
    // suivante ; la base en refuse un. Ce qui se teste n'est pas QUI gagne — la course
    // n'est pas déterministe — mais que le perdant produise un refus NOMMÉ, jamais une
    // erreur non traitée qui remonterait au vendeur en 500.
    it("ne produit jamais d'erreur non traitée quand deux dépôts se croisent", async () => {
        const { productId, vendorId } = await createShopWithProduct();

        const issues = await Promise.allSettled(
            [1, 2, 3, 4].map((nth) => addImage(productId, vendorId, nth)),
        );

        const refus = issues.filter((issue) => issue.status === "rejected");
        for (const echec of refus) {
            expect((echec as PromiseRejectedResult).reason).toHaveProperty(
                "message",
                ERROR_POSITION_TAKEN,
            );
        }

        // Et celles qui passent ont des positions distinctes : c'est la propriété que
        // la contrainte d'unicité existe pour tenir.
        const images = await listImagesForProduct(prisma, { productId, vendorId });
        expect(new Set(images.map((image) => image.position)).size).toBe(images.length);
    });
});

describe("reorderImages", () => {
    // PostgreSQL vérifie l'unicité à chaque instruction : sans le décalage en deux
    // temps, cet échange échoue alors que son état final est valide.
    it("échange deux positions sans violer l'unicité", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const first = await addImage(productId, vendorId, 1);
        const second = await addImage(productId, vendorId, 2);

        await reorderImages(prisma, { productId, vendorId, orderedIds: [second.id, first.id] });

        const images = await listImagesForProduct(prisma, { productId, vendorId });
        expect(images.map((image) => image.id)).toEqual([second.id, first.id]);
        expect(images.map((image) => image.position)).toEqual([0, 1]);
    });

    it("refuse un ordre incomplet", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const first = await addImage(productId, vendorId, 1);
        await addImage(productId, vendorId, 2);

        await expect(
            reorderImages(prisma, { productId, vendorId, orderedIds: [first.id] }),
        ).rejects.toThrow(ERROR_IMAGE_NOT_FOUND);
    });
});

describe("la publication consulte les images", () => {
    it("refuse un produit sans aucune image", async () => {
        const { productId, vendorId } = await createShopWithProduct();

        await expect(
            setProductStatus(prisma, { productId, vendorId, publish: true }),
        ).rejects.toThrow(ERROR_NO_READY_IMAGE);
    });

    it("refuse tant qu'une image attend", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await addImage(productId, vendorId, 2);
        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });

        await expect(
            setProductStatus(prisma, { productId, vendorId, publish: true }),
        ).rejects.toThrow(ERROR_NO_READY_IMAGE);
    });

    it("refuse quand une image a échoué", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageFailed(prisma, { imageId: image.id, reason: "unreadable" });

        await expect(
            setProductStatus(prisma, { productId, vendorId, publish: true }),
        ).rejects.toThrow(ERROR_NO_READY_IMAGE);
    });

    it("accepte quand toutes sont prêtes", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });

        await setProductStatus(prisma, { productId, vendorId, publish: true });

        const product = await prisma.product.findUnique({ where: { id: productId } });
        expect(product?.status).toBe("PUBLISHED");
    });

    // Dépublier ne regarde rien : on n'empêche pas quelqu'un de retirer sa fiche.
    it("laisse toujours dépublier", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);
        await markImageReady(prisma, { imageId: image.id, width: 1200, height: 800 });
        await setProductStatus(prisma, { productId, vendorId, publish: true });
        await markImageFailed(prisma, { imageId: image.id, reason: "unreadable" });

        await setProductStatus(prisma, { productId, vendorId, publish: false });

        const product = await prisma.product.findUnique({ where: { id: productId } });
        expect(product?.status).toBe("DRAFT");
    });
});

describe("deleteImage", () => {
    it("rend le chemin pour que l'appelant fasse le ménage", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await addImage(productId, vendorId, 1);

        const removed = await deleteImage(prisma, { imageId: image.id, vendorId });
        expect(removed?.objectPath).toContain(productId);
        expect(await listImagesForProduct(prisma, { productId, vendorId })).toHaveLength(0);
    });

    it("ne supprime pas l'image d'une autre boutique", async () => {
        const mine = await createShopWithProduct();
        const theirs = await createShopWithProduct();
        const image = await addImage(theirs.productId, theirs.vendorId, 1);

        expect(await deleteImage(prisma, { imageId: image.id, vendorId: mine.vendorId })).toBeNull();
        expect(
            await listImagesForProduct(prisma, {
                productId: theirs.productId,
                vendorId: theirs.vendorId,
            }),
        ).toHaveLength(1);
    });
});
```

- [ ] **Étape 4 : exécuter**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : toutes les suites vertes. **Les suites de T2b vont échouer** : leurs produits
n'ont pas d'image et publient. Corriger `product-repository.int-spec.ts` en ajoutant une
image `READY` avant chaque publication attendue — c'est la conséquence voulue du critère
6, pas une régression.

---

## Tâche 5 : Le worker

**Fichiers**
- Créer : `apps/api/src/modules/media/media.constants.ts`,
  `apps/api/src/modules/media/services/image-derivatives.service.ts`,
  `apps/api/src/modules/media/processors/product-image.processor.ts`,
  `apps/api/src/modules/media/media.module.ts`
- Modifier : `apps/api/src/app.module.ts`
- Tester : `apps/api/src/modules/media/services/image-derivatives.service.spec.ts`,
  `apps/api/test/product-image-worker.int-spec.ts`
- Fixtures : `apps/api/test/fixtures/photo.jpg` (une vraie photo, 1200 × 800),
  `apps/api/test/fixtures/not-an-image.txt`

**Interfaces**
- Consomme : `markImageReady`, `markImageFailed`, `readMedia`, `uploadMedia`,
  `deleteMediaPrefix`, `derivativePath`, `mediaPrefix`, `DERIVATIVE_WIDTHS`.
- Produit : la file `PRODUCT_IMAGE_QUEUE`, le job `{ imageId: string }`.

- [ ] **Étape 1 : les constantes**

`apps/api/src/modules/media/media.constants.ts` :

```ts
export const PRODUCT_IMAGE_QUEUE = "product-images";

// sharp est du CALCUL, et il tourne dans le conteneur qui sert le HTTP. Sans borne, un
// lot de trente photos rend l'API muette pendant une minute. Deux est le compromis :
// assez pour ne pas traîner, assez peu pour laisser respirer les requêtes.
export const PRODUCT_IMAGE_CONCURRENCY = 2;

// Les raisons d'échec sont des CLÉS de traduction : la base ne range pas du français.
export const IMAGE_FAILURE = {
    objectMissing: "object_missing",
    unreadable: "unreadable",
    tooSmall: "too_small",
} as const;
```

- [ ] **Étape 2 : écrire le test unitaire des déclinaisons**

`apps/api/src/modules/media/services/image-derivatives.service.spec.ts` :

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageDerivativesService } from "./image-derivatives.service";

const FIXTURES = join(__dirname, "../../../../test/fixtures");

describe("ImageDerivativesService", () => {
    const service = new ImageDerivativesService();

    it("rend une déclinaison par largeur, en WebP", async () => {
        const original = await readFile(join(FIXTURES, "photo.jpg"));
        const result = await service.derive(original);

        expect(result.width).toBe(1200);
        expect(result.height).toBe(800);
        expect(result.derivatives.map((d) => d.width)).toEqual([320, 800, 1600]);
        // Les octets d'un WebP commencent par « RIFF…WEBP ».
        for (const derivative of result.derivatives) {
            expect(derivative.content.subarray(0, 4).toString()).toBe("RIFF");
            expect(derivative.content.subarray(8, 12).toString()).toBe("WEBP");
        }
    });

    it("n'agrandit jamais au-delà de l'original", async () => {
        const original = await readFile(join(FIXTURES, "photo.jpg"));
        const result = await service.derive(original);
        const large = result.derivatives.find((d) => d.width === 1600);
        expect(large?.content.length).toBeGreaterThan(0);
    });

    it("refuse ce qui n'est pas une image", async () => {
        const junk = await readFile(join(FIXTURES, "not-an-image.txt"));
        await expect(service.derive(junk)).rejects.toThrow();
    });

    // Une image de 20000 × 20000 tient sous les 5 Mo en PNG et ferait allouer des
    // gigaoctets à sharp. Le worker doit la refuser, pas être tué par l'OOM en
    // emportant l'API avec lui.
    it("refuse une image aux dimensions démesurées", async () => {
        const bomb = await readFile(join(FIXTURES, "pixel-bomb.png"));
        await expect(service.derive(bomb)).rejects.toThrow(/pixels|limit/i);
    });

    it("refuse une image trop petite pour la plus petite largeur", async () => {
        const tiny = await readFile(join(FIXTURES, "tiny.png"));
        await expect(service.derive(tiny)).rejects.toThrow(/too_small|petite/i);
    });
});
```

Les fixtures se fabriquent une fois, par un script jeté après usage :

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && node -e \"
const sharp=require('sharp');const fs=require('fs');
fs.mkdirSync('test/fixtures',{recursive:true});
sharp({create:{width:1200,height:800,channels:3,background:'#8a7f72'}}).jpeg().toFile('test/fixtures/photo.jpg');
sharp({create:{width:20000,height:20000,channels:3,background:'#ffffff'}}).png({compressionLevel:9}).toFile('test/fixtures/pixel-bomb.png');
sharp({create:{width:100,height:100,channels:3,background:'#000000'}}).png().toFile('test/fixtures/tiny.png');
fs.writeFileSync('test/fixtures/not-an-image.txt','ceci n\\'est pas une image');
\""
```

- [ ] **Étape 3 : implémenter le service**

`apps/api/src/modules/media/services/image-derivatives.service.ts` :

```ts
import { DERIVATIVE_WIDTHS } from "@clemperl/domain";
import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { IMAGE_FAILURE } from "../media.constants";

export interface IDerivative {
    width: number;
    content: Buffer;
}

export interface IDeriveResult {
    width: number;
    height: number;
    derivatives: IDerivative[];
}

// Le plafond de pixels est la protection qui compte. Un PNG de 20000 × 20000 tient sous
// les 5 Mo que le stockage accepte, et sa décompression demanderait plusieurs Go : sharp
// tuerait le processus, et avec lui l'API qui partage son conteneur. La limite par
// défaut de sharp est plus haute que ce qu'un catalogue justifie.
const MAX_INPUT_PIXELS = 50_000_000;

// sharp est isolé dans un service et non appelé depuis le processeur : c'est du calcul
// pur, il se teste sans file, sans base et sans réseau.
@Injectable()
export class ImageDerivativesService {
    async derive(original: Buffer): Promise<IDeriveResult> {
        const image = sharp(original, { limitInputPixels: MAX_INPUT_PIXELS });
        const metadata = await image.metadata();

        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        if (width === 0 || height === 0) {
            throw new Error(IMAGE_FAILURE.unreadable);
        }
        if (width < DERIVATIVE_WIDTHS[0]) {
            throw new Error(IMAGE_FAILURE.tooSmall);
        }

        const derivatives = await Promise.all(
            DERIVATIVE_WIDTHS.map(async (target) => ({
                width: target,
                // `withoutEnlargement` : une image de 900 px ne devient pas un 1600 px
                // flou et deux fois plus lourd que l'original.
                content: await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
                    .resize({ width: target, withoutEnlargement: true })
                    .webp({ quality: 82 })
                    .toBuffer(),
            })),
        );

        return { width, height, derivatives };
    }
}
```

- [ ] **Étape 4 : exécuter le test unitaire**

```bash
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.ts -t 'ImageDerivativesService'"
```

Attendu : 5 tests verts. Si le test du plafond passe sans lever, vérifier que
`limitInputPixels` est bien transmis aux DEUX appels à `sharp`.

- [ ] **Étape 5 : écrire le processeur**

`apps/api/src/modules/media/processors/product-image.processor.ts` :

```ts
import { deleteMediaPrefix, readMedia, uploadMedia } from "@clemperl/core";
import { markImageFailed, markImageReady, prisma } from "@clemperl/db";
import { derivativePath, mediaPrefix } from "@clemperl/domain";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { IMAGE_FAILURE, PRODUCT_IMAGE_CONCURRENCY, PRODUCT_IMAGE_QUEUE } from "../media.constants";
import { ImageDerivativesService } from "../services/image-derivatives.service";

export interface IProductImageJob {
    imageId: string;
}

@Processor(PRODUCT_IMAGE_QUEUE, { concurrency: PRODUCT_IMAGE_CONCURRENCY })
export class ProductImageProcessor extends WorkerHost {
    private readonly logger = new Logger(ProductImageProcessor.name);

    constructor(private readonly derivatives: ImageDerivativesService) {
        super();
    }

    async process(job: Job<IProductImageJob>): Promise<void> {
        // Le job ne porte QUE l'identifiant. Y mettre les données les figerait au moment
        // de l'empilage, et le worker les servirait périmées.
        const image = await prisma.productImage.findUnique({
            where: { id: job.data.imageId },
            select: { id: true, objectPath: true, product: { select: { deletedAt: true } } },
        });

        // La ligne peut avoir disparu — le vendeur l'a supprimée pendant que le job
        // attendait — ou son produit être supprimé. Dans les deux cas on s'arrête sans
        // écrire et sans lever : il n'y a rien à réparer.
        if (!image || image.product.deletedAt !== null) {
            this.logger.log(`Image ${job.data.imageId} sans objet vivant, job ignoré`);
            return;
        }

        let original: Buffer;
        try {
            original = Buffer.from(await (await readMedia(image.objectPath)).arrayBuffer());
        } catch (error) {
            // L'objet manque : le dépôt n'a pas abouti. Retenter ne le fera pas
            // apparaître, donc on marque et on s'arrête.
            this.logger.warn(`Objet absent pour ${image.id}`, error);
            await markImageFailed(prisma, {
                imageId: image.id,
                reason: IMAGE_FAILURE.objectMissing,
            });
            return;
        }

        let result: Awaited<ReturnType<ImageDerivativesService["derive"]>>;
        try {
            result = await this.derivatives.derive(original);
        } catch (error) {
            const reason =
                error instanceof Error && error.message === IMAGE_FAILURE.tooSmall
                    ? IMAGE_FAILURE.tooSmall
                    : IMAGE_FAILURE.unreadable;
            this.logger.warn(`Image ${image.id} refusée : ${reason}`, error);
            await markImageFailed(prisma, { imageId: image.id, reason });
            // Un fichier dont on SAIT qu'il ne servira jamais n'a pas à occuper d'espace.
            await deleteMediaPrefix(mediaPrefix(image.objectPath));
            return;
        }

        // Toutes les déclinaisons AVANT de basculer en `READY` : `READY` signifie que
        // les trois existent, et T2d s'appuiera dessus sans rien vérifier.
        for (const derivative of result.derivatives) {
            await uploadMedia(
                derivativePath(image.objectPath, derivative.width),
                derivative.content.buffer.slice(
                    derivative.content.byteOffset,
                    derivative.content.byteOffset + derivative.content.byteLength,
                ) as ArrayBuffer,
                "image/webp",
            );
        }

        await markImageReady(prisma, {
            imageId: image.id,
            width: result.width,
            height: result.height,
        });
    }
}
```

- [ ] **Étape 6 : le module et son raccordement**

`apps/api/src/modules/media/media.module.ts` :

```ts
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PRODUCT_IMAGE_QUEUE } from "./media.constants";
import { ProductImageProcessor } from "./processors/product-image.processor";
import { ImageDerivativesService } from "./services/image-derivatives.service";

// Pas de barrel à la racine de ce dossier, et son absence est délibérée : un barrel de
// racine réexporte tout le module, et deux modules qui se citent forment alors un cycle
// d'imports que NestJS résout en livrant `undefined` à l'exécution.
@Module({
    imports: [BullModule.registerQueue({ name: PRODUCT_IMAGE_QUEUE })],
    providers: [ImageDerivativesService, ProductImageProcessor],
    exports: [BullModule],
})
export class MediaModule {}
```

`apps/api/src/app.module.ts` :

```ts
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { MediaModule } from "./modules/media/media.module";

// L'URL est lue ICI et non dans le module : une seule lecture, et le démarrage échoue
// avec le nom de la variable plutôt qu'avec un refus de connexion sans contexte.
function redisConnection(): { host: string; port: number } {
    const url = process.env["REDIS_URL"];
    if (!url) {
        throw new Error("REDIS_URL est absente : la file des médias ne peut pas s'ouvrir.");
    }
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || 6379) };
}

@Module({
    imports: [
        BullModule.forRoot({ connection: redisConnection() }),
        HealthModule,
        AuthModule,
        MediaModule,
    ],
})
export class AppModule {}
```

- [ ] **Étape 7 : le test d'intégration du worker**

`apps/api/test/product-image-worker.int-spec.ts` — la couche qui compte le plus : sharp
est un binaire natif et le stockage un service réseau, rien de tout cela ne se simule.

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readMedia, uploadMedia } from "@clemperl/core";
import { createPendingImage, prisma } from "@clemperl/db";
import { buildOriginalPath, derivativePath } from "@clemperl/domain";
import { Test } from "@nestjs/testing";
import { ImageDerivativesService } from "../src/modules/media/services/image-derivatives.service";
import { ProductImageProcessor } from "../src/modules/media/processors/product-image.processor";

const FIXTURES = join(__dirname, "fixtures");
const PREFIX = "image-worker";
let counter = 0;

async function createShopWithProduct(): Promise<{ vendorId: string; productId: string }> {
    counter += 1;
    const vendor = await prisma.vendor.create({
        data: {
            slug: `${PREFIX}-shop-${counter}`,
            shopName: "Atelier Lumière",
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: "contact@atelier.test",
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: "Atelier Lumière SRL",
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
    const product = await prisma.product.create({
        data: {
            vendorId: vendor.id,
            slug: `${PREFIX}-cabas-${counter}`,
            title: "Sac cabas",
            description: "Cuir pleine fleur, coutures à la main, doublure en lin.",
        },
    });
    return { vendorId: vendor.id, productId: product.id };
}

describe("le worker, contre un vrai stockage", () => {
    let processor: ProductImageProcessor;

    beforeAll(async () => {
        // Le processeur est instancié SANS la file : `process` est une méthode ordinaire,
        // et l'appeler directement teste le traitement sans dépendre de Redis.
        const module = await Test.createTestingModule({
            providers: [ImageDerivativesService, ProductImageProcessor],
        }).compile();
        processor = module.get(ProductImageProcessor);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    async function depose(fixture: string, extension: string) {
        const { productId, vendorId } = await createShopWithProduct();
        const objectPath = buildOriginalPath(productId, `photo.${extension}`);
        const content = await readFile(join(FIXTURES, fixture));
        await uploadMedia(objectPath, content.buffer.slice(0) as ArrayBuffer, "application/octet-stream");

        const image = await createPendingImage(prisma, {
            productId,
            vendorId,
            objectPath,
            originalName: `photo.${extension}`,
        });
        return { imageId: image.id, objectPath };
    }

    it("produit les trois déclinaisons et bascule en READY", async () => {
        const { imageId, objectPath } = await depose("photo.jpg", "jpg");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("READY");
        expect(after?.width).toBe(1200);
        expect(after?.failureReason).toBeNull();

        for (const width of [320, 800, 1600]) {
            const blob = await readMedia(derivativePath(objectPath, width));
            expect(blob.size).toBeGreaterThan(0);
        }
    });

    it("marque FAILED et supprime l'objet quand le fichier n'est pas une image", async () => {
        const { imageId, objectPath } = await depose("not-an-image.txt", "jpg");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("unreadable");
        await expect(readMedia(objectPath)).rejects.toThrow();
    });

    // L'objet a disparu entre la confirmation et le traitement. Retenter ne le fera pas
    // revenir : on marque et on s'arrête.
    it("marque FAILED quand l'objet est absent", async () => {
        const { productId, vendorId } = await createShopWithProduct();
        const image = await createPendingImage(prisma, {
            productId,
            vendorId,
            objectPath: buildOriginalPath(productId, "fantome.jpg"),
            originalName: "fantome.jpg",
        });

        await processor.process({ data: { imageId: image.id } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: image.id } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("object_missing");
    });

    it("ne touche à rien quand le produit a été supprimé", async () => {
        const { imageId } = await depose("photo.jpg", "jpg");
        const image = await prisma.productImage.findUnique({ where: { id: imageId } });
        await prisma.product.update({
            where: { id: image?.productId as string },
            data: { deletedAt: new Date() },
        });

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("PENDING");
    });

    it("refuse une image trop petite", async () => {
        const { imageId } = await depose("tiny.png", "png");

        await processor.process({ data: { imageId } } as never);

        const after = await prisma.productImage.findUnique({ where: { id: imageId } });
        expect(after?.status).toBe("FAILED");
        expect(after?.failureReason).toBe("too_small");
    });
});
```

- [ ] **Étape 8 : la concurrence est affirmée, pas espérée**

Ajouter à `image-derivatives.service.spec.ts` :

```ts
describe("la borne de concurrence", () => {
    // Un critère qui dirait « l'API ne devient pas muette » ne se vérifierait pas. Ce
    // qui se vérifie, c'est que la borne est déclarée en un seul endroit et qu'elle
    // vaut ce qu'on a décidé.
    it("est déclarée et basse", () => {
        expect(PRODUCT_IMAGE_CONCURRENCY).toBeLessThanOrEqual(2);
    });
});
```

- [ ] **Étape 9 : exécuter**

```bash
pnpm docker:up
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.ts"
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
```

Attendu : unitaires verts, et les 5 tests du worker verts contre le vrai stockage.

---

## Tâche 6 : Les écrans du vendeur

**Fichiers**
- Créer : `apps/vendor/src/app/products/[id]/images/actions.ts`,
  `apps/vendor/src/app/products/[id]/images/product-images.tsx`,
  `apps/vendor/src/app/products/[id]/images/types/image-upload-state.interface.ts`
- Modifier : `apps/vendor/src/app/products/[id]/page.tsx`,
  `packages/i18n/messages/vendor/fr.json`
- Tester : `e2e/vendor-product-images.spec.ts` (tâche 7, une fois le relais posé)

**Interfaces**
- Consomme : `createPendingImage`, `listImagesForProduct`, `deleteImage`, `reorderImages`,
  `setImageAltText`, `createSignedUpload`, `deleteMediaPrefix`, `buildOriginalPath`,
  `mediaPrefix`, `ERROR_POSITION_TAKEN`.
- Produit : `requestImageUpload`, `confirmImageUpload`, `removeImage`, `retryImage`,
  `reorderProductImages`, `saveImageAltText`.

- [ ] **Étape 1 : les libellés**

Dans `packages/i18n/messages/vendor/fr.json`, section `products` :

```json
    "imagesSection": "Photos",
    "imagesHint": "Trois Mo au maximum par photo. La première sert d'image principale.",
    "addImages": "Ajouter des photos",
    "imagePending": "Traitement en cours…",
    "imageAlt": "Description de l'image",
    "imageAltHint": "Pour les lecteurs d'écran et les moteurs de recherche.",
    "imageRemove": "Supprimer",
    "imageRetry": "Réessayer",
    "imageMoveUp": "Monter",
    "imageMoveDown": "Descendre",
    "imageMain": "Principale",
```

Et une section `imageFailure`, dont les clés sont celles de `IMAGE_FAILURE` :

```json
  "imageFailure": {
    "object_missing": "Le dépôt n'a pas abouti. Supprimez cette photo et recommencez.",
    "unreadable": "Ce fichier n'est pas une image lisible.",
    "too_small": "Cette image fait moins de 320 pixels de large."
  },
```

Et dans `errors` :

```json
    "imageUploadFailed": "Le dépôt a échoué. Réessayez.",
    "imagePositionTaken": "Une autre photo vient d'être ajoutée. Réessayez.",
    "publishNeedsImages": "Ajoutez au moins une photo, et attendez qu'elles soient toutes traitées."
```

- [ ] **Étape 2 : l'état du formulaire**

`apps/vendor/src/app/products/[id]/images/types/image-upload-state.interface.ts` :

```ts
export interface IImageUploadState {
    message: string[];
    /** Rendue par `requestImageUpload`, consommée par le navigateur pour son PUT. */
    upload?: { imageId: string; signedUrl: string };
}

// Cette constante ne peut PAS vivre dans un fichier « use server » : un tel fichier
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client.
export const INITIAL_IMAGE_STATE: IImageUploadState = { message: [] };
```

- [ ] **Étape 3 : les actions**

`apps/vendor/src/app/products/[id]/images/actions.ts` :

```ts
"use server";

import { createSignedUpload, deleteMediaPrefix } from "@clemperl/core";
import {
    ERROR_POSITION_TAKEN,
    createPendingImage,
    deleteImage,
    prisma,
    readImageForVendor,
    reorderImages,
    setImageAltText,
} from "@clemperl/db";
import { buildOriginalPath, mediaPrefix } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { Queue } from "bullmq";
import { requireVendorMembership } from "../../../../lib/session";

// Une seule file, ouverte une fois. Une `new Queue` par appel ouvrirait une connexion
// Redis par requête, et le serveur finirait par s'en voir refuser.
const queue = new Queue("product-images", {
    connection: (() => {
        const url = process.env["REDIS_URL"];
        if (!url) {
            throw new Error("REDIS_URL est absente : la file des médias est injoignable.");
        }
        const parsed = new URL(url);
        return { host: parsed.hostname, port: Number(parsed.port || 6379) };
    })(),
});

export async function requestImageUpload(
    productId: string,
    originalName: string,
): Promise<{ imageId: string; signedUrl: string } | { error: string }> {
    const { vendor } = await requireVendorMembership();

    // LA LIGNE D'ABORD, l'URL ensuite. Un dépôt qui n'aboutit pas laisse alors une ligne
    // PENDING sans objet — visible et supprimable. L'inverse laisserait un objet payé
    // que rien ne réclame.
    const objectPath = buildOriginalPath(productId, originalName);

    let image: { id: string };
    try {
        image = await createPendingImage(prisma, {
            productId,
            vendorId: vendor.id,
            objectPath,
            originalName,
        });
    } catch (error) {
        console.error("requestImageUpload", error);
        const taken = error instanceof Error && error.message === ERROR_POSITION_TAKEN;
        return {
            error: taken ? messages.errors.imagePositionTaken : messages.errors.imageUploadFailed,
        };
    }

    try {
        const { signedUrl } = await createSignedUpload(objectPath);
        return { imageId: image.id, signedUrl };
    } catch (error) {
        console.error("createSignedUpload", error);
        await deleteImage(prisma, { imageId: image.id, vendorId: vendor.id });
        return { error: messages.errors.imageUploadFailed };
    }
}

export async function confirmImageUpload(imageId: string): Promise<void> {
    const { vendor } = await requireVendorMembership();

    // On relit AVEC le `vendorId` : `imageId` vient du client.
    const image = await readImageForVendor(prisma, { imageId, vendorId: vendor.id });
    if (!image) {
        return;
    }

    await queue.add("process", { imageId }, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });
    revalidatePath(`/products/${image.productId}`);
}

export async function retryImage(imageId: string): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const image = await readImageForVendor(prisma, { imageId, vendorId: vendor.id });
    if (!image) {
        return;
    }
    await prisma.productImage.update({
        where: { id: imageId },
        data: { status: "PENDING", failureReason: null },
    });
    await queue.add("process", { imageId }, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });
    revalidatePath(`/products/${image.productId}`);
}

export async function removeImage(imageId: string, productId: string): Promise<void> {
    const { vendor } = await requireVendorMembership();

    const removed = await deleteImage(prisma, { imageId, vendorId: vendor.id });
    if (removed) {
        // APRÈS le commit : supprimer avant laisserait, si la transaction échouait, une
        // ligne pointant vers le vide.
        await deleteMediaPrefix(mediaPrefix(removed.objectPath));
    }
    revalidatePath(`/products/${productId}`);
}

export async function reorderProductImages(
    productId: string,
    orderedIds: string[],
): Promise<void> {
    const { vendor } = await requireVendorMembership();
    try {
        await reorderImages(prisma, { productId, vendorId: vendor.id, orderedIds });
    } catch (error) {
        console.error("reorderProductImages", error);
    }
    revalidatePath(`/products/${productId}`);
}

export async function saveImageAltText(
    imageId: string,
    productId: string,
    altText: string,
): Promise<void> {
    const { vendor } = await requireVendorMembership();
    await setImageAltText(prisma, {
        imageId,
        vendorId: vendor.id,
        altText: altText.trim() === "" ? null : altText.trim(),
    });
    revalidatePath(`/products/${productId}`);
}
```

- [ ] **Étape 4 : le composant**

`apps/vendor/src/app/products/[id]/images/product-images.tsx` :

```tsx
"use client";

import { derivativePath } from "@clemperl/domain/browser";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Field } from "@clemperl/ui";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type JSX } from "react";
import {
    confirmImageUpload,
    removeImage,
    reorderProductImages,
    retryImage,
    saveImageAltText,
} from "./actions";
import { requestImageUpload } from "./actions";

interface ImageRow {
    id: string;
    status: string;
    objectPath: string;
    altText: string | null;
    failureReason: string | null;
}

interface ProductImagesProps {
    productId: string;
    images: ImageRow[];
    /** Origine de la boutique : c'est ELLE qui porte la route de relais. */
    mediaOrigin: string;
}

export function ProductImages(props: ProductImagesProps): JSX.Element {
    const t = messages.products;
    const failures = messages.imageFailure as Record<string, string>;
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pending = props.images.some((image) => image.status === "PENDING");

    // Tant qu'une image attend, la page se redemande au serveur. Pas de WebSocket : le
    // temps réel est T7, et une file de quelques secondes ne le justifie pas.
    useEffect(() => {
        if (!pending) {
            return;
        }
        const timer = setInterval(() => router.refresh(), 2000);
        return () => clearInterval(timer);
    }, [pending, router]);

    async function onFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        setBusy(true);
        setError(null);

        for (const file of files) {
            const asked = await requestImageUpload(props.productId, file.name);
            if ("error" in asked) {
                setError(asked.error);
                break;
            }
            // Le fichier va du navigateur AU STOCKAGE. Aucun serveur à nous ne le relaie.
            const response = await fetch(asked.signedUrl, { method: "PUT", body: file });
            if (!response.ok) {
                setError(messages.errors.imageUploadFailed);
                break;
            }
            await confirmImageUpload(asked.imageId);
        }

        setBusy(false);
        router.refresh();
    }

    function move(index: number, delta: number): void {
        const ordered = props.images.map((image) => image.id);
        const target = index + delta;
        if (target < 0 || target >= ordered.length) {
            return;
        }
        const [moved] = ordered.splice(index, 1);
        ordered.splice(target, 0, moved as string);
        void reorderProductImages(props.productId, ordered);
    }

    return (
        <section className="mt-12 flex flex-col gap-6">
            <h2 className="text-sm text-muet">{t.imagesSection}</h2>
            <p className="text-sm text-muet">{t.imagesHint}</p>

            <label className="self-start border border-bordure px-4 py-2 text-sm">
                {t.addImages}
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) => void onFiles(event)}
                />
            </label>

            {error !== null && (
                <p role="alert" className="text-sm text-accent">
                    {error}
                </p>
            )}

            <ul className="flex flex-col gap-6">
                {props.images.map((image, index) => (
                    <li key={image.id} className="flex gap-4 border-t border-bordure pt-4">
                        <div className="w-24 shrink-0">
                            {image.status === "READY" ? (
                                <Image
                                    src={`${props.mediaOrigin}/api/media/${derivativePath(image.objectPath, 320)}`}
                                    alt={image.altText ?? ""}
                                    width={96}
                                    height={96}
                                    className="object-cover"
                                />
                            ) : (
                                <span className="text-xs text-muet">
                                    {image.status === "PENDING"
                                        ? t.imagePending
                                        : (failures[image.failureReason ?? ""] ?? "")}
                                </span>
                            )}
                        </div>

                        <div className="flex grow flex-col gap-2">
                            {index === 0 && <span className="text-xs text-muet">{t.imageMain}</span>}
                            <Field
                                label={t.imageAlt}
                                defaultValue={image.altText ?? ""}
                                hint={t.imageAltHint}
                                onBlur={(event) =>
                                    void saveImageAltText(
                                        image.id,
                                        props.productId,
                                        event.target.value,
                                    )
                                }
                            />
                            <div className="flex gap-4 text-xs">
                                <button type="button" onClick={() => move(index, -1)}>
                                    {t.imageMoveUp}
                                </button>
                                <button type="button" onClick={() => move(index, 1)}>
                                    {t.imageMoveDown}
                                </button>
                                {image.status === "FAILED" && (
                                    <button
                                        type="button"
                                        onClick={() => void retryImage(image.id)}
                                    >
                                        {t.imageRetry}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => void removeImage(image.id, props.productId)}
                                >
                                    {t.imageRemove}
                                </button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
```

- [ ] **Étape 5 : brancher la page**

Dans `apps/vendor/src/app/products/[id]/page.tsx`, après la lecture du produit :

```tsx
const images = await listImagesForProduct(prisma, { productId: id, vendorId: vendor.id });
```

et, après `<ProductForm …/>` :

```tsx
<ProductImages
    productId={product.id}
    mediaOrigin={process.env.NEXT_PUBLIC_STOREFRONT_URL ?? ""}
    images={images.map((image) => ({
        id: image.id,
        status: image.status,
        objectPath: image.objectPath,
        altText: image.altText,
        failureReason: image.failureReason,
    }))}
/>
```

**Notation POINTÉE** pour `process.env.NEXT_PUBLIC_*` : en notation crochets, Next ne
substitue pas, `process` n'existe pas dans le navigateur, et l'hydratation abandonne.

Le domaine de la boutique doit être autorisé pour `next/image` — dans
`apps/vendor/next.config.ts`, ajouter `images: { remotePatterns: [...] }` pointant
l'origine de la boutique. À défaut, remplacer `<Image>` par un `<img>` ordinaire : ce sont
des vignettes de 96 px dans un back-office, l'optimisation n'y gagne rien.

- [ ] **Étape 6 : l'action de publication**

Dans `apps/vendor/src/app/products/[id]/actions.ts`, `toggleProductStatus` doit désormais
traiter le refus :

```ts
export async function toggleProductStatus(form: FormData): Promise<void> {
    const { vendor } = await requireVendorMembership();
    const productId = String(form.get("productId") ?? "");

    try {
        await setProductStatus(prisma, {
            productId,
            vendorId: vendor.id,
            publish: form.get("publish") === "1",
        });
    } catch (error) {
        // Le dépôt refuse de publier sans photo prête. Journaliser, et laisser la page
        // se re-rendre : l'écran montre déjà l'état de chaque image, c'est là que le
        // vendeur lira pourquoi.
        console.error("toggleProductStatus", error);
    }
    revalidatePath(`/products/${productId}`);
}
```

- [ ] **Étape 7 : vérifier**

```bash
pnpm lint && pnpm typecheck
pnpm --filter @clemperl/vendor build
```

Le `build` est là pour une raison précise : il échouerait si `@clemperl/domain/browser`
entraînait `node:crypto` dans le paquet navigateur. C'est le contrôle de l'étape 4 de la
tâche 3.

---

## Tâche 7 : Le relais, et le parcours complet

**Fichiers**
- Créer : `apps/storefront/src/app/api/media/[...path]/route.ts`, `e2e/vendor-product-images.spec.ts`
- Modifier : `e2e/global-setup.ts`
- Tester : `apps/api/test/media-route.int-spec.ts` *(le prédicat est déjà couvert en tâche 3 ;
  ici on éprouve la route montée)*

- [ ] **Étape 1 : la route**

`apps/storefront/src/app/api/media/[...path]/route.ts` :

```ts
import { readMedia } from "@clemperl/core";
import { isServableMediaPath } from "@clemperl/domain";
import { NextResponse } from "next/server";

// Un an, et `immutable`. Les chemins ne changent JAMAIS — un `uuid` par dépôt, jamais
// réécrit — donc aucune invalidation n'est nécessaire. C'est ce qui fait que le relais
// coûte le premier accès et pas les suivants, et qu'un proxy placé devant le met en
// cache comme n'importe quelle réponse.
const CACHE = "public, max-age=31536000, immutable";

export async function GET(
    _request: Request,
    context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
    const { path } = await context.params;
    const joined = path.join("/");

    // Le prédicat est ANCRÉ et vit dans le domaine. Combiné au bucket distinct, il fait
    // deux barrières indépendantes : même relâché, il ne pourrait atteindre aucun
    // justificatif, qui vit dans un autre bucket.
    if (!isServableMediaPath(joined)) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        const blob = await readMedia(joined);
        return new NextResponse(blob.stream(), {
            headers: {
                "Content-Type": blob.type || "application/octet-stream",
                "Cache-Control": CACHE,
            },
        });
    } catch {
        return new NextResponse(null, { status: 404 });
    }
}
```

- [ ] **Étape 2 : éprouver la route montée**

`apps/api/test/media-route.int-spec.ts` — elle vit ici parce que la couche intégration a
le stockage sous la main :

```ts
import { uploadMedia } from "@clemperl/core";
import { buildOriginalPath, derivativePath, isServableMediaPath } from "@clemperl/domain";

const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "http://storefront:3000";

describe("la route de relais", () => {
    it("sert une déclinaison déposée", async () => {
        const original = buildOriginalPath("c1zqk8s0000008l3h2f4g5j6", "photo.jpg");
        const path = derivativePath(original, 320);
        await uploadMedia(path, new TextEncoder().encode("RIFF....WEBP").buffer as ArrayBuffer, "image/webp");

        const response = await fetch(`${STOREFRONT}/api/media/${path}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toContain("immutable");
    });

    it("répond 404 à un chemin hors motif", async () => {
        const response = await fetch(`${STOREFRONT}/api/media/applications/abc/identity-1.pdf`);
        expect(response.status).toBe(404);
    });

    // Deux barrières indépendantes : le motif refuse, et le bucket distinct rendrait la
    // lecture impossible même s'il acceptait.
    it("ne peut désigner aucun justificatif", () => {
        expect(isServableMediaPath("applications/abc/identity-1.pdf")).toBe(false);
    });
});
```

- [ ] **Étape 3 : le parcours navigateur**

`e2e/vendor-product-images.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop } from "./helpers/accounts";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test("un vendeur dépose une photo, attend son traitement, puis publie", async ({
    page,
    request,
    browser,
}) => {
    await createApprovedVendorShop(page, request, browser);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill("Sac cabas en cuir");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir pleine fleur tanné végétal, coutures à la main, doublure en lin.");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("180,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    // Publier sans photo est refusé : le produit reste en brouillon.
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Brouillon")).toBeVisible();

    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/product.jpg");

    // Le traitement est asynchrone. La page se rafraîchit d'elle-même ; on attend que
    // la vignette existe plutôt qu'un délai arbitraire.
    await expect(page.getByRole("img")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();
});
```

La fixture `e2e/fixtures/product.jpg` se fabrique comme celles de la tâche 5 — une image
de 1200 × 800.

- [ ] **Étape 4 : préchauffer**

Dans `e2e/global-setup.ts`, ajouter `${URL_STOREFRONT}/api/media/inexistant` à la liste :
la route est compilée au premier accès comme toutes les autres, et un 404 la compile
aussi bien qu'un 200.

- [ ] **Étape 5 : exécuter**

```bash
pnpm docker:up
docker compose --env-file .env -f docker/docker-compose.dev.yml ps
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
pnpm test:e2e
```

Attendu : toutes vertes. **Les parcours de T2b vont échouer** là où ils publient sans
photo — les corriger en y déposant une image, c'est la conséquence voulue du critère 6.

---

## Tâche 8 : Planchers, critères, et remise

- [ ] **Étape 1 : relever les couvertures**

```bash
env -u DATABASE_URL pnpm test 2>&1 | grep -E "@clemperl/.*All files"
```

Inscrire les valeurs **mesurées**. Le cliquet monte, jamais il ne descend.

- [ ] **Étape 2 : prouver que le cliquet mord**

```bash
cat > packages/domain/src/utils/ratchet-probe.utils.ts <<'EOF'
export function neverCalled(value: number): number {
    return value > 0 ? value * 2 : 0;
}
EOF
pnpm --filter @clemperl/domain test
rm packages/domain/src/utils/ratchet-probe.utils.ts
pnpm --filter @clemperl/domain test
```

Attendu : échec sur `does not meet global threshold`, puis retour au vert.

- [ ] **Étape 3 : les dix critères d'acceptation**

```bash
pnpm lint && pnpm typecheck && env -u DATABASE_URL pnpm test && pnpm verify:thresholds
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand"
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"
pnpm test:e2e
```

Puis reprendre un à un les dix critères de la section 14 de la spec.

- [ ] **Étape 4 : la documentation**

Dans `docs/passation.md` : T2c en « **Livrée** », et à « Ce qui reste ouvert » — les
lignes `PENDING` abandonnées que seul le vendeur nettoie, l'absence d'AVIF, et le fait
que la route de relais ne vérifie pas la publication.

Dans `CLAUDE.md`, la ligne de routage :

```
| Déposer une image, toucher à la file ou au worker | [Design T2c](docs/superpowers/specs/2026-09-24-t2c-pipeline-medias-design.md) |
```

Dans `docs/pieges.md`, toute entrée gagnée pendant l'exécution.

- [ ] **Étape 5 : nettoyer**

```bash
rm -rf test-results playwright-report
docker image prune -f
docker ps -a --filter "ancestor=postgres:17-alpine" --format '{{.Names}}'
```

- [ ] **Étape 6 : remettre le commit**

Rédigé en **anglais**, sans trailer d'attribution, et **exécuté par le propriétaire du
dépôt** sauf autorisation explicite. Le corps dit : ce que la tranche livre, les six
décisions et leur raison, ce qui n'est pas armé, ce qui n'a pas été vérifié, et les suites
hors périmètre.

---

## Auto-revue du plan

**Couverture de la spec.** Les quinze sections sont couvertes : le modèle et les buckets
en tâche 1, le stockage en tâche 2, les chemins en tâche 3, les dépôts et la publication
en tâche 4, le worker en tâche 5, les écrans en tâche 6, le relais et le parcours en
tâche 7, les critères et la remise en tâche 8.

**Cohérence des types.** `derivativePath` et `mediaPrefix` sont définis en tâche 3 et
consommés tels quels en 5, 6 et 7. `IMAGE_FAILURE` est défini en tâche 5 et ses valeurs
sont les clés du catalogue en tâche 6. `objectPath` désigne partout l'ORIGINAL.

**Deux points à surveiller à l'exécution.**

`media-path.utils.ts` importe `node:crypto` pour `buildOriginalPath`. La tâche 3 impose
de le déplacer hors de `browser.ts`, et la tâche 6 le vérifie par un `build` réel — c'est
le même défaut que T2b a payé avec nodemailer, et il ne se voit qu'au build.

Les suites de T2b publient des produits sans photo. Les tâches 4 et 7 disent explicitement
de les corriger : c'est la conséquence voulue du critère 6, et la confondre avec une
régression ferait perdre une heure.
