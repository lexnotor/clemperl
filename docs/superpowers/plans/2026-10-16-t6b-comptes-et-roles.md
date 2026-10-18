# T6b, comptes et rôles : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal :** la plateforme peut nommer et retirer des administrateurs à deux niveaux, et un
compte créé depuis l'administration reçoit UN courriel portant un lien à usage unique vers
la page où il choisit son mot de passe.

**Architecture :** une troisième valeur dans `E_USER_ROLE`, une fonction de décision pure
dans `packages/domain` par laquelle passent tous les tests de rôle du dépôt, un dépôt dans
`packages/db` dont l'écriture protège le dernier super_admin sous verrou consultatif, et un
écran `/accounts` sur la forme de `/shops`. L'invitation n'appelle pas `signUpEmail` : elle
écrit la ligne `User` sans justificatif puis demande une réinitialisation, et c'est
`resetPassword` qui crée le justificatif au moment où la personne choisit son mot de passe.

**Tech Stack :** Prisma 7.10 et PostgreSQL 17, better-auth 1.7.5, Next.js 16 en server
actions, Jest pour l'intégration dans `apps/api`, Vitest pour les packages, Playwright pour
le navigateur, Mailpit pour observer ce qui part.

**Spec :** `docs/superpowers/specs/2026-10-16-t6b-comptes-et-roles-design.md`

## Global Constraints

- Identifiants, noms de fichiers, segments d'URL et clés de traduction en **anglais** ;
  documentation, commentaires et libellés en **français**.
- Aucun tiret quadratin ni demi-cadratin nulle part, code et prose compris.
- Indentation : **4 espaces** en TypeScript, **2 espaces** dans les JSON, y compris
  `packages/i18n/messages/admin/fr.json`.
- **Aucune configuration Prettier** dans ce dépôt : ne pas le lancer.
- Assertions de refus : `rejects.toMatchObject({ message: CONST })`, **jamais** `toThrow`,
  qui compare par sous-chaîne.
- `packages/domain` ne doit jamais être importé par `packages/db` : le cycle casse `turbo`.
- Seuils de couverture à **100 %** dans `packages/domain`, `packages/db` (hors
  `src/repositories/**`) et `packages/auth` (hors `**/*.config.ts`). Tout fichier neuf de
  `packages/domain/src` et `packages/auth/src/utils` arrive avec son `.spec.ts`.
- Les dépôts de `packages/db/src/repositories/**` sont couverts par la suite
  d'intégration, pas par Vitest.
- `revalidatePath` suit la structure de fichiers : dans l'administration, `/accounts` sans
  segment de locale.
- Chaque server action rappelle sa garde : une action est une route publique.
- Un seul commit pour toute la tranche, à la fin, en anglais. La spec et ce plan voyagent
  dedans.
- Après tout `switch` touchant `schema.prisma`, rebâtir : `packages/db/generated/` est
  ignoré par Git.

## Review Focus

Les cinq entrées que la spec implique sans qu'aucune tâche ne les éprouve d'elle-même. La
ligne dit l'entrée et ce qu'une personne raisonnable attend ; le test qui la fixe est
ajouté à la tâche qui porte le code.

1. **Un `userId` inventé ou absent dans l'action de rôle.** `setPlatformRole` doit refuser
   nommément plutôt que rendre un succès sur zéro ligne touchée. Test en tâche 4.
2. **Un administrateur qui poste `SUPER_ADMIN` à l'action de nomination.** L'écran ne rend
   pas l'option ; l'action doit la refuser quand même. Test en tâche 6.
3. **Une adresse ou un nom vides dans le formulaire d'invitation.** Le chemin
   d'invitation abandonne `signUpEmail`, donc il abandonne AUSSI la validation d'adresse
   que celui-ci faisait : sans schéma, `""` entre en base. Test en tâche 2.
4. **Un renvoi d'invitation visant un compte qui a déjà son mot de passe.** Le bouton n'est
   pas rendu, mais l'action est publique : elle enverrait une réinitialisation à quelqu'un
   qui n'a rien demandé. Test en tâche 6.
5. **Un retrait visant un compte déjà `CUSTOMER`.** Ne doit ni lever ni annoncer un retrait
   qui n'a pas eu lieu. Test en tâche 4.

---

## Décisions de plan à relire

Deux points où la spec laisse deux lectures, tranchés ici et signalés pour relecture.

**L'élévation d'un administrateur en super_admin est rendue sur sa ligne.** La matrice de
la section 2 accorde « Nommer un super_admin » à un super_admin, et la section 6 ne décrit
que le formulaire de création. Les deux lectures se contredisent : sans bouton sur la
ligne, cette case de la matrice est inatteignable, puisque l'adresse d'un collègue déjà
administrateur est prise et que la section 9 refuse l'invitation sur une adresse existante.
La ligne porte donc le bouton, visible du seul super_admin.

**Un compte retiré ne peut pas revenir.** Retirer ramène à `CUSTOMER`, les clients ne sont
pas listés, et la section 9 refuse de promouvoir un client existant. Qui est retiré par
erreur garde donc un compte qu'aucun écran ne peut re-nommer. C'est la conséquence des
non-buts, pas un oubli ; elle est écrite ici pour qu'elle soit choisie et non subie.

---

### Task 1 : mesurer ce qui part, avant d'écrire la moindre ligne

La spec l'exige : une piste choisie sur sa plausibilité coûterait la tranche. La lecture de
`better-auth@1.7.5` dit que `resetPassword` crée le justificatif quand il n'en existe pas
(`dist/api/routes/password.mjs`, branche `if (!await findCredentialAccount(userId))`), ce
qui rend la piste 1 réalisable sans écrire d'`Account` à la main. Cette tâche le vérifie à
l'exécution, et vérifie surtout les trois points qu'une lecture ne tranche pas.

**Files:**
- Create : un script jetable dans le répertoire de travail temporaire de la session, hors
  du dépôt. Rien de ce script n'est commité.
- Modify : `docs/superpowers/specs/2026-10-16-t6b-comptes-et-roles-design.md` (section 10,
  pour y inscrire la mesure)

**Interfaces:**
- Consumes : rien.
- Produces : la piste retenue, que les tâches 4 et 5 appliquent sans la rediscuter.

- [ ] **Step 1 : lever la pile de développement et vider la boîte**

Run : `pnpm docker:up`, puis attendre que `docker compose --env-file .env -f
docker/docker-compose.dev.yml ps` donne `healthy` sur `postgres`, `mailpit` et
`storefront`.
Attendu : les trois services sains. Mailpit répond sur `http://localhost:8025`.

Vider la boîte avant de compter : `curl -X DELETE http://localhost:8025/api/v1/messages`.

- [ ] **Step 2 : écrire le script de mesure**

Il tourne DANS le conteneur `storefront`, seul endroit où `@clemperl/auth` est monté avec
les variables d'environnement qui lui donnent `baseURL`, `SMTP_URL` et le secret. Il
mesure, pour une adresse neuve à chaque exécution :

1. `prisma.user.create({ data: { email, name, emailVerified: true, role: "ADMIN" } })`,
   sans aucune ligne `Account`, puis
   `auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })`.
   Compter les messages reçus par cette adresse via
   `GET http://mailpit:8025/api/v1/search?query=to:<adresse>`.
2. Relever `verifications.expires_at` pour l'identifiant `reset-password:%` qui vient
   d'être créé, et le comparer à `now()`.
3. Suivre le lien du message jusqu'au bout : `POST /api/auth/reset-password` avec le jeton
   et un mot de passe, puis `POST /api/auth/sign-in/email` avec la même adresse.

- [ ] **Step 3 : lancer la mesure et relever les quatre réponses**

Run : `docker compose --env-file .env -f docker/docker-compose.dev.yml exec storefront node <script>`
Attendu, et c'est ce qu'il faut ÉCRIRE, pas supposer :

- combien de messages arrivent (la contrainte est : **un seul**) ;
- si `auth.api.requestPasswordReset` appelé côté serveur, sans requête HTTP entrante,
  passe le `originCheck` posé sur `redirectTo` ; c'est le point le plus susceptible de
  casser, le `redirectTo` relatif n'ayant jamais été exercé que depuis le navigateur ;
- si `resetPassword` crée bien le justificatif absent, donc si la personne peut se
  connecter ensuite ;
- l'écart entre `expires_at` et `now()`, qui doit valoir une heure tant que
  `resetPasswordTokenExpiresIn` n'est pas posée.

- [ ] **Step 4 : si la piste 1 échoue, mesurer la piste 2 avant de la retenir**

Seulement si l'étape 3 montre un refus. `emailVerification.sendOnSignUp` est lue à
l'inscription comme `sendOnSignUp ?? requireEmailVerification` : la poser à `false`
coupe le courriel de vérification de TOUTES les inscriptions, pas de ce chemin seul. La
piste 2 n'existe donc que sous la forme d'un `sendVerificationEmail` qui se tait quand le
compte n'a aucun justificatif. Le mesurer de la même façon avant de l'adopter.

- [ ] **Step 5 : inscrire la mesure dans la spec**

Ajouter à la fin de la section 10 un paragraphe « Mesuré le 2026-10-16 » qui donne les
quatre réponses et nomme la piste retenue. La spec est le document qui exigeait la mesure ;
c'est là que sa réponse se lit.

---

### Task 2 : la matrice, pure, dans le domaine

**Files:**
- Create : `packages/domain/src/utils/platform-roles.utils.ts`
- Create : `packages/domain/src/utils/platform-roles.utils.spec.ts`
- Create : `packages/domain/src/schemas/administrator-invitation.schema.ts`
- Create : `packages/domain/src/schemas/administrator-invitation.schema.spec.ts`
- Modify : `packages/domain/src/utils/index.ts`, `packages/domain/src/schemas/index.ts`

**Interfaces:**
- Consumes : rien. Aucun import de `@clemperl/db`, même pour les enums : ces fonctions
  prennent des chaînes.
- Produces :
  - `type TPlatformRole = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN"`
  - `isAdministrator(role: string): boolean`
  - `canAppoint(actorRole: string, targetRole: string): boolean`
  - `canRemove(actorRole: string, currentRole: string): boolean`
  - `administratorInvitationSchema`, `type TAdministratorInvitation`

Le paramètre est `string` et non `TPlatformRole` : `session.user.role` arrive de Better
Auth typé `string`, et prendre `string` ici fait disparaître les conversions de type chez
tous les appelants au lieu d'en ajouter une par appel. Une valeur hors vocabulaire tombe du
côté du refus.

- [ ] **Step 1 : écrire le test de la matrice, exhaustif**

```ts
import { describe, expect, it } from "vitest";
import { canAppoint, canRemove, isAdministrator } from "./platform-roles.utils.js";

const ROLES = ["CUSTOMER", "ADMIN", "SUPER_ADMIN"] as const;

describe("les rôles de plateforme", () => {
    it("reconnaît les deux niveaux d'administration", () => {
        expect(isAdministrator("ADMIN")).toBe(true);
        expect(isAdministrator("SUPER_ADMIN")).toBe(true);
        expect(isAdministrator("CUSTOMER")).toBe(false);
        expect(isAdministrator("")).toBe(false);
    });

    // Les neuf cases, écrites une par une : une boucle sur un tableau attendu ne dirait
    // pas LAQUELLE a changé le jour où elle rougit.
    it("ne laisse nommer un super_admin qu'à un super_admin", () => {
        expect(canAppoint("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
        expect(canAppoint("SUPER_ADMIN", "ADMIN")).toBe(true);
        expect(canAppoint("ADMIN", "ADMIN")).toBe(true);
        expect(canAppoint("ADMIN", "SUPER_ADMIN")).toBe(false);
        expect(canAppoint("CUSTOMER", "ADMIN")).toBe(false);
        expect(canAppoint("CUSTOMER", "SUPER_ADMIN")).toBe(false);
    });

    // Nommer quelqu'un CLIENT n'est pas nommer : c'est retirer, et cela passe par
    // `canRemove`. Sans ce refus, le formulaire de création servirait à fabriquer des
    // clients depuis l'administration.
    it("ne nomme jamais à `CUSTOMER`", () => {
        for (const actor of ROLES) {
            expect(canAppoint(actor, "CUSTOMER")).toBe(false);
        }
    });

    it("ne laisse retirer un super_admin qu'à un super_admin", () => {
        expect(canRemove("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
        expect(canRemove("SUPER_ADMIN", "ADMIN")).toBe(true);
        expect(canRemove("ADMIN", "ADMIN")).toBe(true);
        expect(canRemove("ADMIN", "SUPER_ADMIN")).toBe(false);
        expect(canRemove("CUSTOMER", "ADMIN")).toBe(false);
        expect(canRemove("CUSTOMER", "SUPER_ADMIN")).toBe(false);
    });

    // Un compte qui ne porte aucun rôle n'a rien à perdre. Le refus ici est ce qui fait
    // dire à l'action « ce compte n'est pas un compte d'administration » plutôt que
    // d'annoncer un retrait qui n'a pas eu lieu.
    it("n'a rien à retirer à un client", () => {
        for (const actor of ROLES) {
            expect(canRemove(actor, "CUSTOMER")).toBe(false);
        }
    });

    // La garde du dernier super_admin ne vit PAS ici : elle dépend du nombre de lignes en
    // base, que cette fonction ne connaît pas. Elle vit dans l'écriture, tâche 4.
    it("laisse un super_admin se retirer lui-même, la garde du dernier étant ailleurs", () => {
        expect(canRemove("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    });
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `pnpm --filter @clemperl/domain exec vitest run src/utils/platform-roles.utils.spec.ts`
Attendu : ÉCHEC, « Failed to resolve import "./platform-roles.utils.js" ».

- [ ] **Step 3 : écrire `platform-roles.utils.ts`**

Les trois fonctions et le type. Le commentaire de tête dit pourquoi elles existent : huit
comparaisons à `"ADMIN"` étaient écrites en dur dans le dépôt, et les élargir une par une
rouvrirait la seconde vérité que ce dépôt a déjà payée deux fois.

- [ ] **Step 4 : vérifier que le test passe**

Run : `pnpm --filter @clemperl/domain exec vitest run src/utils/platform-roles.utils.spec.ts`
Attendu : PASS.

- [ ] **Step 5 : écrire le test du schéma d'invitation**

Review Focus nº3. Le chemin d'invitation n'appelle plus `signUpEmail`, donc plus rien ne
valide l'adresse : sans ce schéma, une chaîne vide entre en base et le compte est
injoignable pour toujours.

```ts
import { describe, expect, it } from "vitest";
import { administratorInvitationSchema } from "./administrator-invitation.schema.js";

describe("l'invitation d'un administrateur", () => {
    it("accepte un nom et une adresse", () => {
        const parsed = administratorInvitationSchema.parse({
            name: "  Awa Traoré  ",
            email: "awa@clemperl.test",
            role: "ADMIN",
        });
        // Le nom est RABOTÉ : il s'affiche dans la liste, et « Awa » précédé de deux
        // espaces y creuserait un trou qu'aucun écran ne rattrape.
        expect(parsed.name).toBe("Awa Traoré");
    });

    it("refuse une adresse qui n'en est pas une", () => {
        expect(administratorInvitationSchema.safeParse({
            name: "Awa", email: "awa", role: "ADMIN",
        }).success).toBe(false);
        expect(administratorInvitationSchema.safeParse({
            name: "Awa", email: "", role: "ADMIN",
        }).success).toBe(false);
    });

    it("refuse un nom vide ou réduit à des espaces", () => {
        expect(administratorInvitationSchema.safeParse({
            name: "   ", email: "awa@clemperl.test", role: "ADMIN",
        }).success).toBe(false);
    });

    // `CUSTOMER` n'est pas un niveau qu'on accorde : le refuser ICI évite que le
    // formulaire serve à créer des clients.
    it("n'accepte que les deux niveaux d'administration", () => {
        expect(administratorInvitationSchema.safeParse({
            name: "Awa", email: "awa@clemperl.test", role: "CUSTOMER",
        }).success).toBe(false);
    });
});
```

- [ ] **Step 6 : écrire le schéma**

`z.object({ name: z.string().trim().min(1).max(80), email: z.email(), role: z.enum(["ADMIN", "SUPER_ADMIN"]) })`,
sur la forme de `shop-profile.schema.ts`. Pas d'import de `@clemperl/db/enums` : l'enum
Prisma porte `CUSTOMER`, que ce schéma refuse, et s'en servir donnerait un vocabulaire plus
large que la règle.

- [ ] **Step 7 : brancher les deux barillets et vérifier la couverture**

Ajouter les deux fichiers à `utils/index.ts` et `schemas/index.ts`, par ordre alphabétique.
Ne PAS toucher `browser.ts` : aucun composant client n'a besoin de ces fonctions, et
l'écran d'administration les lit côté serveur.

Run : `pnpm --filter @clemperl/domain test`
Attendu : PASS, et les seuils à 100 % tiennent.

---

### Task 3 : le rôle en base, et les neuf comparaisons en dur

Le `grep` demandé par la section 4 a été lancé. Il y a **neuf** sites de production, pas
huit :

| Fichier | Ligne | Ce qu'il fait |
| --- | --- | --- |
| `apps/admin/src/lib/session.ts` | 14 | compte les `ADMIN` pour décider de rediriger vers `/setup` |
| `apps/admin/src/lib/session.ts` | 29 | refuse la session dont le rôle n'est pas `ADMIN` |
| `apps/admin/src/app/setup/actions.ts` | 16 | barrière d'amorçage |
| `apps/admin/src/app/setup/actions.ts` | 38 | pose le rôle du premier compte |
| `apps/admin/src/app/setup/page.tsx` | 12 | barrière d'amorçage au rendu |
| `apps/storefront/src/app/[locale]/(account)/become-a-vendor/actions.ts` | 216 | convertit le rôle de session |
| `packages/domain/src/utils/vendor-permissions.utils.ts` | 7 | type de l'acteur |
| `packages/domain/src/utils/vendor-permissions.utils.ts` | 11 | `canViewApplication` |
| `packages/domain/src/utils/vendor-permissions.utils.ts` | 15 | `canDecide` |

Plus deux tests : `apps/api/test/shop-suspension.int-spec.ts:122` et
`packages/domain/src/utils/vendor-permissions.utils.spec.ts:6`.

À noter en passant : `canDecide` et `canViewApplication` ne sont appelées par aucun code de
production, l'écran de décision s'appuyant sur `requireAdministrator` seul. La vraie garde
est donc celle de `session.ts`. Les élargir reste nécessaire, pour qu'elles ne soient pas
un piège au premier appelant.

**Files:**
- Modify : `packages/db/prisma/schema.prisma` (enum `E_USER_ROLE`)
- Create : `packages/db/prisma/migrations/20261016120000_super_admin/migration.sql`
- Modify : `packages/domain/src/utils/vendor-permissions.utils.ts`
- Modify : `packages/domain/src/utils/vendor-permissions.utils.spec.ts`
- Modify : `apps/admin/src/lib/session.ts`
- Modify : `apps/admin/src/app/setup/actions.ts`
- Modify : `apps/admin/src/app/setup/page.tsx`
- Modify : `apps/storefront/src/app/[locale]/(account)/become-a-vendor/actions.ts:216`
- Create : `packages/db/src/repositories/administrator.repository.ts` (une seule fonction
  ici, la tâche 4 le remplit)
- Modify : `packages/db/src/repositories/index.ts`
- Test : `apps/api/test/accounts.int-spec.ts` (créé ici, complété en tâche 4)

**Interfaces:**
- Consumes : `isAdministrator` de la tâche 2.
- Produces : `E_USER_ROLE.SUPER_ADMIN` et `countAdministrators(prisma): Promise<number>`.

Le dépôt naît ICI avec sa seule fonction de lecture, et non en tâche 4 : la barrière
d'amorçage en a besoin, et la lui faire attendre une tâche plus loin finirait celle-ci en
rouge, donc refuserait au relecteur l'état vert sur lequel se prononcer.

- [ ] **Step 1 : écrire le test d'intégration de la barrière**

Il éprouve ce que la section 5 exige : une base qui ne porte qu'un `SUPER_ADMIN` est une
base installée.

```ts
it("compte les DEUX rôles d'administration : un super_admin seul suffit", async () => {
    const admin = await prisma.user.create({
        data: { email: `${PREFIX}-sa-1@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
    });
    expect(await countAdministrators(prisma)).toBe(1);

    // Compter les seuls `ADMIN` rendrait zéro ici, donc rouvrirait l'amorçage sur l'état
    // que l'amorçage produit lui-même : la plateforme se réinstallerait par-dessus son
    // propre propriétaire.
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    expect(await countAdministrators(prisma)).toBe(1);

    await prisma.user.update({ where: { id: admin.id }, data: { role: "CUSTOMER" } });
    expect(await countAdministrators(prisma)).toBe(0);
});
```

- [ ] **Step 2 : ajouter la valeur à l'énumération et écrire la migration**

`SUPER_ADMIN` après `ADMIN` dans `enum E_USER_ROLE`. La migration fait deux choses, dans
cet ordre, et son commentaire dit pourquoi la seconde existe :

```sql
-- `SUPER_ADMIN` rejoint l'énumération, et toute base qui portait un `ADMIN` est PROMUE.
--
-- Sans la promotion, une base existante se retrouverait avec un administrateur, aucun
-- super_admin, et une barrière d'amorçage qui compte les deux rôles : plus personne ne
-- pourrait nommer de super_admin, et `/setup` refuserait d'en créer un. C'est l'anti-but
-- de la section 8 de la spec, atteint par une migration qui ne dit rien.
--
-- Les bases existantes n'en portent qu'un, celui de leur amorçage, qui est bien le
-- propriétaire de l'instance.
ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN';
```

PostgreSQL refuse d'utiliser une valeur d'enum ajoutée dans la même transaction que son
`ALTER TYPE`. La promotion va donc dans un **second fichier de migration**,
`20261016120100_promote_existing_admins/migration.sql` :

```sql
UPDATE "users" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';
```

- [ ] **Step 3 : vérifier que la migration s'applique et que le client se rebâtit**

Run : `pnpm --filter @clemperl/db exec prisma migrate deploy` puis
`pnpm --filter @clemperl/db exec prisma generate`
Attendu : deux migrations appliquées, et `E_USER_ROLE.SUPER_ADMIN` présent dans
`packages/db/generated/prisma/enums.ts`.

Si l'étape 2 s'est trompée et que les deux instructions sont dans un seul fichier, l'erreur
est `unsafe use of new value "SUPER_ADMIN" of enum type user_role`. La corriger en
séparant, pas en ajoutant un `COMMIT`.

- [ ] **Step 4 : élargir `vendor-permissions.utils.ts` et son test**

`IActor.role` passe de `"CUSTOMER" | "ADMIN"` à `string`. `canViewApplication` et
`canDecide` appellent `isAdministrator(actor.role)`. Ajouter au `.spec.ts` existant un
`SUPER_ADMIN = { id: "sa_1", role: "SUPER_ADMIN" } as const` et, dans les deux `it`
concernés, la ligne qui montre qu'il peut autant qu'un administrateur :

```ts
expect(canDecide(SUPER_ADMIN)).toBe(true);
expect(canViewApplication(SUPER_ADMIN, { applicantId: "usr_1" })).toBe(true);
```

- [ ] **Step 5 : élargir les six sites des deux fronts**

- `session.ts:14` et `setup/actions.ts:16` et `setup/page.tsx:12` : `countAdministrators(prisma)`
  à la place de `prisma.user.count({ where: { role: "ADMIN" } })`.
- `session.ts:29` : `if (!isAdministrator(session.user.role)) { notFound(); }`.
- `setup/actions.ts:38` : `role: "SUPER_ADMIN"`. Le commentaire existant explique déjà
  pourquoi le rôle se pose ici ; lui ajouter la raison du niveau, tirée de la section 5.
- `become-a-vendor/actions.ts:216` : la conversion disparaît, `role: session.user.role`
  suffisant une fois `IActor.role` en `string`.

- [ ] **Step 6 : écrire `countAdministrators` et lancer les deux suites**

`prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null } })`,
dans un fichier de dépôt neuf que la tâche 4 remplira. Le commentaire dit ce que compter les
seuls `ADMIN` rouvrirait.

Run : `pnpm --filter @clemperl/domain test`
Attendu : PASS, seuils tenus.
Run : `pnpm --filter @clemperl/api exec jest --config jest.config.integration.ts --runInBand test/accounts.int-spec.ts`
Attendu : PASS.

---

### Task 4 : le dépôt, et la garde du dernier super_admin

**Files:**
- Modify : `packages/db/src/repositories/administrator.repository.ts` (créé en tâche 3)
- Test : `apps/api/test/accounts.int-spec.ts`

**Interfaces:**
- Consumes : `countAdministrators` et le fichier de dépôt de la tâche 3. Rien de
  `packages/domain` ; le cycle est interdit. Ce dépôt n'arbitre aucune
  permission, il protège une seule chose que le domaine ne peut pas voir : le nombre de
  super_admin restants.
- Produces :
  - `ERROR_ACCOUNT_NOT_FOUND`, `ERROR_ACCOUNT_EMAIL_TAKEN`, `ERROR_LAST_SUPER_ADMIN`
  - `listAdministrationAccounts(prisma): Promise<{ id: string; email: string; name: string | null; role: string; pending: boolean }[]>`
  - `createInvitedAdministrator(prisma, input: { email: string; name: string; role: "ADMIN" | "SUPER_ADMIN" }): Promise<{ id: string }>`
  - `setPlatformRole(prisma, input: { userId: string; role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN" }): Promise<{ previousRole: string }>`
  - `isAwaitingFirstPassword(prisma, userId: string): Promise<boolean>`

`pending` se dérive de l'absence de toute ligne `Account`, et non de l'absence de
justificatif de mot de passe : un compte Google en porte un sans mot de passe, et le
confondre avec une invitation lui enverrait un courriel d'accueil le jour où il demande une
réinitialisation. `isAwaitingFirstPassword` dérive de la même condition, pour que la liste
et le choix du courriel disent la même chose.

- [ ] **Step 1 : écrire les tests d'intégration**

Dans `apps/api/test/accounts.int-spec.ts`, avec un `PREFIX = "acct"` propre au fichier, sur
la forme de `shop-suspension.int-spec.ts`. Sept tests, dont les deux du Review Focus.

```ts
it("crée un compte d'administration sans aucun justificatif, donc en attente", async () => {
    const { id } = await createInvitedAdministrator(prisma, {
        email: `${PREFIX}-1@clemperl.test`, name: "Awa", role: "ADMIN",
    });
    await expect(isAwaitingFirstPassword(prisma, id)).resolves.toBe(true);
    const liste = await listAdministrationAccounts(prisma);
    expect(liste.find((ligne) => ligne.id === id)?.pending).toBe(true);

    // Dès qu'un justificatif existe, l'attente cesse : c'est la MÊME condition qui décide
    // de la colonne et du courriel, et ce test est ce qui le prouve.
    await prisma.account.create({
        data: { id: `${PREFIX}-acc-1`, accountId: id, providerId: "credential", userId: id, password: "x" },
    });
    await expect(isAwaitingFirstPassword(prisma, id)).resolves.toBe(false);
});

it("ne liste que les comptes d'administration", async () => {
    const client = await prisma.user.create({
        data: { email: `${PREFIX}-client@exemple.test`, emailVerified: true },
    });
    const liste = await listAdministrationAccounts(prisma);
    expect(liste.map((ligne) => ligne.id)).not.toContain(client.id);
});

it("refuse une adresse déjà prise, nommément", async () => {
    const email = `${PREFIX}-doublon@clemperl.test`;
    await prisma.user.create({ data: { email, emailVerified: true } });
    await expect(
        createInvitedAdministrator(prisma, { email, name: "Awa", role: "ADMIN" }),
    ).rejects.toMatchObject({ message: ERROR_ACCOUNT_EMAIL_TAKEN });
});

// Review Focus nº1.
it("refuse un identifiant qui ne désigne personne", async () => {
    await expect(
        setPlatformRole(prisma, { userId: "usr_inexistant", role: "CUSTOMER" }),
    ).rejects.toMatchObject({ message: ERROR_ACCOUNT_NOT_FOUND });
});

// Review Focus nº5, et le cas de la section 9 : deux administrateurs retirent le MÊME
// compte en même temps. L'état visé est atteint et rien ne lève ; c'est `previousRole` qui
// dit lequel des deux a réellement retiré, donc lequel peut l'annoncer.
it("rend le rôle précédent, ce qui dit si le retrait a eu lieu", async () => {
    const client = await prisma.user.create({
        data: { email: `${PREFIX}-deja@exemple.test`, emailVerified: true },
    });
    const { previousRole } = await setPlatformRole(prisma, { userId: client.id, role: "CUSTOMER" });
    expect(previousRole).toBe("CUSTOMER");

    const pair = await prisma.user.create({
        data: { email: `${PREFIX}-meme@clemperl.test`, emailVerified: true, role: "ADMIN" },
    });
    const deux = await Promise.all([
        setPlatformRole(prisma, { userId: pair.id, role: "CUSTOMER" }),
        setPlatformRole(prisma, { userId: pair.id, role: "CUSTOMER" }),
    ]);
    // `all` et non `allSettled` : aucun des deux ne doit lever. Un seul voit `ADMIN`.
    expect(deux.filter((issue) => issue.previousRole === "ADMIN")).toHaveLength(1);
});

// La section 11 le demande nommément : retirer un rôle de plateforme ne touche à rien
// d'autre. Sans ce test, une jointure ajoutée un jour à l'écriture passerait inaperçue
// jusqu'à ce qu'un ancien administrateur perde ses commandes.
it("laisse intacts les commandes, le panier et l'appartenance à une boutique", async () => {
    const compte = await prisma.user.create({
        data: { email: `${PREFIX}-garde@clemperl.test`, emailVerified: true, role: "ADMIN" },
    });
    const shop = await createShop();
    await prisma.vendorMember.create({
        data: { vendorId: shop.id, userId: compte.id, role: "OWNER" },
    });
    await prisma.cart.create({ data: { userId: compte.id } });

    await setPlatformRole(prisma, { userId: compte.id, role: "CUSTOMER" });

    await expect(
        prisma.vendorMember.count({ where: { userId: compte.id } }),
    ).resolves.toBe(1);
    await expect(prisma.cart.count({ where: { userId: compte.id } })).resolves.toBe(1);
});

it("laisse retirer un super_admin tant qu'il en reste un autre, et refuse le dernier", async () => {
    const un = await prisma.user.create({
        data: { email: `${PREFIX}-sa-a@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
    });
    const deux = await prisma.user.create({
        data: { email: `${PREFIX}-sa-b@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
    });

    await setPlatformRole(prisma, { userId: un.id, role: "CUSTOMER" });
    await expect(
        setPlatformRole(prisma, { userId: deux.id, role: "CUSTOMER" }),
    ).rejects.toMatchObject({ message: ERROR_LAST_SUPER_ADMIN });

    // Le compte reste INTACT : retirer n'est pas supprimer.
    await expect(prisma.user.findUnique({ where: { id: un.id } })).resolves.toMatchObject({
        role: "CUSTOMER", email: `${PREFIX}-sa-a@clemperl.test`,
    });
});
```

- [ ] **Step 2 : écrire le test de concurrence, celui que la spec exige**

C'est le test central de la tranche. La section 9 nomme le cas qui peut vider la
plateforme : deux retraits partis ensemble, chacun voyant l'autre comme le pair qui reste.

```ts
it("ne laisse JAMAIS zéro super_admin, même sur deux retraits simultanés", async () => {
    const un = await prisma.user.create({
        data: { email: `${PREFIX}-race-a@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
    });
    const deux = await prisma.user.create({
        data: { email: `${PREFIX}-race-b@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
    });

    // `allSettled` et non `all` : l'un des deux DOIT échouer, et `all` ferait tomber le
    // test sur ce refus au lieu de l'observer.
    const issues = await Promise.allSettled([
        setPlatformRole(prisma, { userId: un.id, role: "CUSTOMER" }),
        setPlatformRole(prisma, { userId: deux.id, role: "CUSTOMER" }),
    ]);

    // L'assertion porte sur l'ÉTAT, pas sur lequel des deux a gagné : les deux ordres sont
    // légitimes, et exiger un vainqueur ferait un test instable. Le dépôt a déjà payé ce
    // piège sur `collection.int-spec.ts`.
    const restants = await prisma.user.count({ where: { role: "SUPER_ADMIN", deletedAt: null } });
    expect(restants).toBe(1);
    expect(issues.filter((issue) => issue.status === "rejected")).toHaveLength(1);
    expect(issues.find((issue) => issue.status === "rejected")).toMatchObject({
        reason: { message: ERROR_LAST_SUPER_ADMIN },
    });
});
```

- [ ] **Step 3 : vérifier que les tests échouent**

Run : `pnpm --filter @clemperl/api exec jest --config jest.config.integration.ts --runInBand test/accounts.int-spec.ts`
Attendu : ÉCHEC sur les exports absents du dépôt, pas sur autre chose. Le FICHIER existe
déjà, posé en tâche 3 : un échec portant sur son import est un défaut de la tâche 3.

- [ ] **Step 4 : écrire le dépôt**

Les cinq fonctions qui manquent. `setPlatformRole` est la seule qui demande une décision
de forme, et la voici, avec sa raison :

```ts
// Une clé constante, et un verrou consultatif de TRANSACTION. L'invariant porte sur un
// NOMBRE, pas sur une ligne : deux retraits visent deux lignes différentes, donc un verrou
// sur la ligne visée ne protège rien, et verrouiller « l'ensemble des super_admin » ferait
// dépendre la portée du verrou d'une requête dont le résultat change entre les deux
// transactions.
//
// Une condition d'écriture ne suffit pas non plus. `UPDATE ... WHERE (SELECT count(*) ...) > 1`
// évalue sa sous-requête sur l'instantané de SON instruction : en `READ COMMITTED`, les
// deux transactions y lisent deux, aucune ne bloque sur la ligne de l'autre, et les deux
// réussissent. C'est exactement le trou qu'on ferme.
//
// Les changements de rôle sont rares : les sérialiser tous entre eux ne coûte rien.
const PLATFORM_ROLES_LOCK = 611_200_001;
```

La transaction prend le verrou, lit le rôle courant, refuse `ERROR_ACCOUNT_NOT_FOUND` si la
ligne n'existe pas, compte les super_admin restants quand le rôle courant est `SUPER_ADMIN`
et que le rôle visé ne l'est pas, lève `ERROR_LAST_SUPER_ADMIN` si ce compte vaut un, puis
écrit. Elle rend `{ previousRole }`.

`createInvitedAdministrator` convertit la violation d'unicité Prisma en
`ERROR_ACCOUNT_EMAIL_TAKEN` : `packages/db/src/prisma-errors.ts` porte déjà le prédicat que
le reste du dépôt utilise pour cela. La ligne naît avec `emailVerified: true`, comme celle
de l'amorçage, et sans aucune ligne `Account`.

- [ ] **Step 5 : vérifier que les tests passent**

Run : `pnpm --filter @clemperl/api exec jest --config jest.config.integration.ts --runInBand test/accounts.int-spec.ts`
Attendu : PASS, les huit tests.

Si l'appel au verrou échoue sur un type, l'erreur PostgreSQL nomme
`pg_advisory_xact_lock`. Écrire le paramètre avec sa conversion, `${PLATFORM_ROLES_LOCK}::bigint`,
plutôt que de chercher la surcharge à deux entiers.

- [ ] **Step 6 : prouver la portance par mutation**

Retirer la ligne du verrou, relancer le test de l'étape 2 dix fois de suite. Attendu :
il rougit au moins une fois. Le remettre, relancer dix fois : vert dix fois. Un test de
course qui ne rougit jamais sans sa garde ne prouve rien, et c'est la seule façon de le
savoir.

Run : `for i in $(seq 1 10); do pnpm --filter @clemperl/api exec jest --config jest.config.integration.ts --runInBand -t "JAMAIS zéro" || break; done`

---

### Task 5 : un seul courriel, et il ne ressemble pas à un oubli de mot de passe

**Files:**
- Create : `packages/auth/src/utils/administrator-invitation-message.utils.ts`
- Create : `packages/auth/src/utils/administrator-invitation-message.utils.spec.ts`
- Modify : `packages/auth/src/utils/index.ts`
- Modify : `packages/auth/src/config/auth.config.ts`

**Interfaces:**
- Consumes : `isAwaitingFirstPassword` de la tâche 4 ; la piste retenue par la tâche 1.
- Produces :
  - `buildAdministratorInvitationMessage(link: string, locale: string): IEmailMessage`
  - `RESET_PASSWORD_TOKEN_EXPIRES_IN` (en secondes)

Le message de réinitialisation existant dit « Si vous n'êtes pas à l'origine de cette
demande, ignorez ce message ». Envoyé à quelqu'un qu'on vient d'embaucher, il lui conseille
d'ignorer la seule chose qui lui ouvre son compte. `sendResetPassword` choisit donc entre
deux messages, et il choisit sur la condition de la tâche 4.

- [ ] **Step 1 : écrire le test du constructeur**

```ts
import { describe, expect, it } from "vitest";
import {
    RESET_PASSWORD_TOKEN_EXPIRES_IN,
    buildAdministratorInvitationMessage,
} from "./administrator-invitation-message.utils.js";

const LIEN = "https://clemperl.test/api/auth/reset-password/jeton";

describe("le courriel d'invitation", () => {
    it("porte le lien et ne conseille PAS de l'ignorer", () => {
        const message = buildAdministratorInvitationMessage(LIEN, "fr");
        expect(message.text).toContain(LIEN);
        // Le message de réinitialisation porte cette phrase. La partager ici dirait à un
        // collègue d'ignorer le seul lien qui lui ouvre son compte.
        expect(message.text).not.toContain("ignorez");
    });

    it("annonce la durée, et la durée annoncée est celle qui est configurée", () => {
        expect(buildAdministratorInvitationMessage(LIEN, "fr").text).toContain("trois jours");
        // Changer la constante sans changer la phrase ferait mentir le courriel. Cette
        // assertion est le seul endroit qui relie les deux.
        expect(RESET_PASSWORD_TOKEN_EXPIRES_IN).toBe(3 * 24 * 60 * 60);
    });

    it("parle anglais au besoin, et retombe sur le français", () => {
        expect(buildAdministratorInvitationMessage(LIEN, "en").text).toContain("three days");
        expect(buildAdministratorInvitationMessage(LIEN, "de").text).toContain("trois jours");
    });
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `pnpm --filter @clemperl/auth exec vitest run src/utils/administrator-invitation-message.utils.spec.ts`
Attendu : ÉCHEC sur l'import.

- [ ] **Step 3 : écrire le constructeur**

Sur la forme de `password-reset-message.utils.ts` : un objet `TEXTS` à deux langues, et
`buildAdministratorInvitationMessage` qui retombe sur le français. Le texte français dit
qu'un compte d'administration a été créé pour cette adresse, donne le lien, et dit qu'il
vaut trois jours et ne sert qu'une fois.

- [ ] **Step 4 : vérifier que le test passe**

Run : `pnpm --filter @clemperl/auth test`
Attendu : PASS, seuils à 100 % tenus.

- [ ] **Step 5 : brancher la configuration**

Dans `auth.config.ts`, deux changements :

- `emailAndPassword.resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN`. Le
  commentaire dit que la durée est GLOBALE : elle allonge aussi tous les liens d'oubli de
  mot de passe des clients, ce que la section 10 de la spec accepte explicitement.
- `sendResetPassword` demande `isAwaitingFirstPassword(prisma, user.id)` et choisit le
  constructeur. Le commentaire dit pourquoi la condition est l'absence de TOUTE ligne
  `Account` et non l'absence de mot de passe : un compte Google en porte une.

Ce fichier est exclu des seuils par `**/*.config.ts` ; c'est la suite navigateur de la
tâche 7 qui l'éprouve.

- [ ] **Step 6 : vérifier que rien d'autre n'a bougé**

Run : `pnpm --filter @clemperl/auth test && pnpm --filter @clemperl/auth typecheck`
Attendu : PASS.

---

### Task 6 : l'écran `/accounts`

**Files:**
- Create : `apps/admin/src/app/accounts/page.tsx`
- Create : `apps/admin/src/app/accounts/invitation-form.tsx`
- Create : `apps/admin/src/app/accounts/account-row.tsx`
- Create : `apps/admin/src/app/accounts/actions.ts`
- Create : `apps/admin/src/app/accounts/types/accounts-state.interface.ts`
- Modify : `packages/i18n/messages/admin/fr.json`

**Interfaces:**
- Consumes : `canAppoint`, `canRemove`, `isAdministrator`, `administratorInvitationSchema`
  (tâche 2) ; `listAdministrationAccounts`, `createInvitedAdministrator`,
  `setPlatformRole`, `isAwaitingFirstPassword`, les trois constantes d'erreur (tâche 4) ;
  `requireAdministrator` élargi (tâche 3).
- Produces : trois server actions, `invite`, `changeRole`, `resendInvitation`, toutes de
  signature `(previous: IAccountsState, form: FormData) => Promise<IAccountsState>`.

Une seule action pour les trois boutons de rôle. Le formulaire poste le rôle VISÉ, et
l'action demande au domaine `canRemove` quand ce rôle est `CUSTOMER`, `canAppoint` sinon.
Un bouton qui dit l'état visé plutôt que la bascule est déjà la règle de `/shops`.

- [ ] **Step 1 : poser les libellés**

Ajouter à `packages/i18n/messages/admin/fr.json`, **indenté à deux espaces**, un bloc
`accounts` et un bloc `errors.accounts`. Les clés d'erreur reprennent exactement les noms
des constantes du dépôt, en minuscules : `email_taken`, `not_found`, `last_super_admin`,
plus `forbidden`, `invalid`, `not_pending`, `mail_failed`, `failed`.

`mail_failed` suit la leçon de T6a : le compte est créé, c'est un fait, et une panne de
relais ne doit pas faire échouer l'action, sinon l'administrateur recommence et bute sur
l'unicité de l'adresse. Le texte renvoie vers le bouton de renvoi.

- [ ] **Step 2 : écrire les actions**

Chacune rappelle `requireAdministrator()` et lit `session.user.role`. Trois refus que
l'écran ne rend pas mais que l'action doit prononcer, parce qu'une action est une route
publique :

- **Review Focus nº2** : `invite` et `changeRole` passent le rôle visé au domaine. Un
  administrateur qui poste `SUPER_ADMIN` reçoit `forbidden`.
- **Review Focus nº4** : `resendInvitation` vérifie `isAwaitingFirstPassword` AVANT
  d'appeler `requestPasswordReset`, et rend `not_pending` sinon. Sans ce contrôle, l'action
  enverrait une réinitialisation à quelqu'un qui n'a rien demandé.
- **Review Focus nº1 et nº5** : `changeRole` laisse remonter `ERROR_ACCOUNT_NOT_FOUND` du
  dépôt et le traduit ; le `previousRole` qu'il rend sert à ne pas annoncer un retrait qui
  n'a pas eu lieu.

`invite` enchaîne : schéma, domaine, `createInvitedAdministrator`, puis
`auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })` dans un
`try` séparé, dont l'échec rend `mail_failed` sans annuler la création.

Toutes appellent `revalidatePath("/accounts")` en cas de succès. Sans segment de locale :
l'administration n'en a pas, contrairement à la boutique.

- [ ] **Step 3 : écrire la page et les deux composants client**

`page.tsx` appelle `requireAdministrator()`, lit le rôle de la session, et passe à chaque
ligne ce que ce rôle autorise, calculé par `canAppoint` et `canRemove`. **Les actions
absentes ne sont pas rendues**, pas grisées : la règle de T3 et T5.

`invitation-form.tsx` porte `Field` pour le nom et l'adresse, et `SelectField` pour le
niveau. Les options du niveau sont filtrées par `canAppoint` : un administrateur ne voit
pas `SUPER_ADMIN`.

`account-row.tsx` porte le rôle en clair, la marque d'attente le cas échéant, et les
boutons permis : retirer, renvoyer l'invitation si en attente, élever en super_admin si le
lecteur en est un et que la ligne est un administrateur.

- [ ] **Step 4 : vérifier à la main, dans un navigateur**

Run : `pnpm docker:up`, puis ouvrir `http://localhost:3002/accounts` après s'être connecté
avec le compte d'amorçage.
Attendu : la liste porte le seul compte existant, marqué super_admin, sans bouton de
retrait, puisqu'il est le dernier. Inviter une adresse neuve fait apparaître une ligne en
attente, et Mailpit sur `http://localhost:8025` montre **un seul** message pour cette
adresse.

C'est la première fois que le chemin complet s'exerce. Regarder le message avant de passer
à la suite : la tâche 1 a mesuré combien il en part, pas ce qu'il raconte.

- [ ] **Step 5 : lint et typecheck sur les deux fronts touchés**

Run : `pnpm --filter @clemperl/admin lint && pnpm --filter @clemperl/admin typecheck`
Attendu : PASS.

---

### Task 7 : le parcours navigateur, et le commit

**Files:**
- Create : `e2e/accounts.spec.ts`
- Modify : `e2e/helpers/accounts.ts` (un compteur de messages)

**Interfaces:**
- Consumes : `signInAsAdministrator`, `signInFromPage`, `linkFor`, `PASSWORD`,
  `URL_ADMIN`, `URL_MAILPIT`, `URL_STOREFRONT`.
- Produces : rien ; c'est la dernière tâche.

`signInAsAdministrator` amorce l'instance par `/setup`, qui crée désormais un
`SUPER_ADMIN` : le compte dont la suite dispose est donc exactement celui dont le parcours
a besoin. Rien à changer dans ce helper.

- [ ] **Step 1 : ajouter le compteur de messages au helper**

```ts
// Compte les messages reçus par une adresse. Sert à prouver qu'une invitation en produit
// UN, ce qui est l'anti-but le plus facile à rater de la tranche : le parcours
// fonctionnerait à l'identique avec deux courriels, dont un qui ne sert à rien.
export async function messageCountFor(
    request: APIRequestContext,
    address: string,
): Promise<number>
```

- [ ] **Step 2 : écrire le parcours**

Celui de la section 11, en entier, avec le compte à la fin.

```ts
test("un super_admin invite un administrateur, qui choisit son mot de passe et entre", async ({
    page, request, browser,
}) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const address = `collegue-${suffix}@clemperl.test`;

    await signInAsAdministrator(page);
    await page.goto(`${URL_ADMIN}/accounts`);
    await page.getByLabel("Nom").fill(`Collègue ${suffix}`);
    await page.getByLabel("Adresse e-mail").fill(address);
    await page.getByRole("combobox", { name: "Niveau" }).selectOption("ADMIN");
    await page.getByRole("button", { name: "Créer le compte" }).click();

    // La ligne APPARAÎT, marquée en attente. On attend ce que l'action a produit, pas un
    // libellé que l'écran portait déjà.
    const ligne = page.locator("li").filter({ hasText: address });
    await expect(ligne.getByText("En attente", { exact: false })).toBeVisible({ timeout: 30_000 });

    // Le LIEN, pris dans le courriel. `linkFor` attend celui qui porte le fragment
    // attendu : un compte peut recevoir plusieurs messages, et « le dernier » en désigne
    // un autre dès que deux tests tournent ensemble.
    const lien = await linkFor(request, address, "reset-password");

    const invite = await browser.newContext();
    const sien = await invite.newPage();
    await sien.goto(lien);
    await sien.getByLabel("Mot de passe").fill(PASSWORD);
    await sien.getByRole("button", { name: "Choisir ce mot de passe" }).click();
    await sien.waitForURL(/\/sign-in/, { timeout: 30_000 });

    await signInFromPage(sien, address);
    await sien.goto(`${URL_ADMIN}/accounts`);

    // Il est DANS l'administration, et son niveau ne lui laisse pas nommer de super_admin.
    // C'est l'assertion que la matrice doit à l'écran.
    await expect(sien.locator("main")).toContainText("comptes d'administration");
    const niveau = sien.getByRole("combobox", { name: "Niveau" });
    await expect(niveau.getByRole("option", { name: "Super_admin" })).toHaveCount(0);

    // Et il n'est PLUS en attente, vu du bureau qui l'a invité.
    await page.reload();
    await expect(ligne.getByText("En attente", { exact: false })).toHaveCount(0);

    // UN seul courriel, et l'assertion vient à la FIN : un courriel de vérification parti
    // avec l'inscription aurait eu tout le parcours pour arriver. La compter plus tôt
    // laisserait passer celui qui traîne.
    expect(await messageCountFor(request, address)).toBe(1);

    await invite.close();
});
```

- [ ] **Step 3 : lancer le parcours**

Run : `pnpm docker:up` puis `pnpm exec playwright test e2e/accounts.spec.ts`
Attendu : PASS.

La suite navigateur tourne contre la pile de DÉVELOPPEMENT. Ne pas la lancer contre
`docker-compose.e2e.yml` : Better Auth y allume son limiteur de débit, et la création de
comptes y prend des 429. Piège consigné dans `docs/pieges.md`.

- [ ] **Step 4 : la suite complète**

Run : `pnpm lint && pnpm typecheck && pnpm test && pnpm verify:thresholds`
Attendu : PASS partout.
Run : `pnpm --filter @clemperl/api exec jest --config jest.config.integration.ts --runInBand`
Attendu : PASS.
Run : `pnpm exec playwright test`
Attendu : PASS. `payment.spec.ts` tombe environ une fois sur trois en local pour une cause
non établie et sans rapport : relancer ce fichier seul avant de conclure à une régression.

- [ ] **Step 5 : consigner ce qui mérite de l'être**

Si la tâche 1 a mesuré quelque chose qu'une lecture du code ne donnait pas, une entrée dans
`docs/pieges.md`. La durée globale du jeton de réinitialisation en est une candidate : elle
s'allonge pour tous les clients à cause d'un besoin de l'administration, et rien dans le
code ne le dit à l'endroit où on le découvrirait.

Mettre à jour `docs/passation.md` : la tranche livrée, et les deux décisions de plan de
l'en-tête, pour qu'elles soient relues plutôt qu'oubliées.

- [ ] **Step 6 : commit**

Un seul commit pour toute la tranche, message en anglais, spec et plan dedans, aucune
signature d'attribution.

```bash
git add -A
git commit
```
