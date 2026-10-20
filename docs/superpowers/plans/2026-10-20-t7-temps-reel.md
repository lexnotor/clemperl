# T7, le temps réel : plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal :** ce qui change ailleurs (commande, paiement, photo, litige) s'affiche de lui-même
chez la personne concernée, avec une alerte, où qu'elle soit dans son application.

**Architecture :** les fronts déposent un événement dans une file BullMQ après chaque écriture
concernée ; l'API consomme la file, ou émet directement pour ce qu'elle écrit elle-même, relit
en base qui prévenir, et émet par Socket.IO vers des salles dérivées de la session et de
l'application. Le navigateur affiche une alerte et rafraîchit la page, qui relit ses données
avec ses propres gardes. L'adaptateur Redis de Socket.IO relaie l'émission entre exemplaires
de l'API.

**Tech Stack :** NestJS 12.0.3 avec `@nestjs/websockets` et `@nestjs/platform-socket.io`
12.0.3, `@socket.io/redis-adapter` 8.3.0, `socket.io-client` 4.8.4, BullMQ 6.3.8 et ioredis
6.0.0 déjà présents, Next.js 16 et React 19.3, Prisma 7, Jest dans `apps/api`, Vitest
ailleurs, Playwright.

**Spec :** `docs/superpowers/specs/2026-10-20-t7-temps-reel-design.md`

## Avant la tâche 1

- La branche `feat/realtime` existe, partie de `main` après la fusion de T6d ; la spec et ce
  plan y sont commités. La branche `docs/t6d-delivered` et sa PR fermée sont abandonnées : le
  passage de T6d à « Livrée » est fait dans la passation de cette branche.
- **Toute écriture Git ou GitHub se demande au propriétaire, à chaque fois.** Aucun commit par
  tâche : un seul commit de chantier, à la fin, qu'il passe ou autorise.
- **Suites lourdes** : deux suites Testcontainers en parallèle sur un même poste se gênent.
  Si une autre session de travail en lance sur le même poste, s'entendre avec elle avant toute
  suite d'intégration, toute pile Docker et tout parcours navigateur.
- Paquets rebâtis : `pnpm turbo run build --filter='./packages/*'`.

## Global Constraints

- Identifiants, noms de fichiers, segments d'URL et clés de traduction en **anglais** ;
  documentation, commentaires et libellés en **français**.
- Aucun tiret cadratin ni demi-cadratin, code et prose compris.
- Indentation : 4 espaces en TypeScript, 2 dans les JSON de `packages/i18n/messages/`, que
  l'on réécrit par un aller-retour `json` vérifié identique avant modification.
- Aucune configuration Prettier : ne pas le lancer.
- Un commentaire est au présent et ne cite jamais un numéro de tâche, de spec ou de section.
- `packages/db` n'importe jamais `packages/domain`, et `packages/core` n'importe ni l'un ni
  l'autre.
- Assertions de refus : `rejects.toMatchObject({ message })`, jamais `toThrow` sur une
  constante ; côté actions, comparer `error.message ===`, lire les tables par `Object.hasOwn`.
- Un événement ne transporte que de quoi composer l'alerte : jamais une donnée que la page de
  son destinataire n'affiche pas déjà.
- **Un dépôt ou une émission ratés ne font jamais échouer l'écriture** qui les précède.
- Le dépôt d'un événement se fait **après** l'écriture et **hors** de sa transaction.
- Seuils de couverture : 100 % pour `packages/domain`, `packages/core`, `packages/db` hors
  `src/repositories/**`, et `apps/api`.
- Avant d'écrire du code Next, lire le guide concerné dans `node_modules/next/dist/docs/`.
- Le conteneur `api` ne monte que les sources : rebâtir `@clemperl/db` DANS le conteneur
  avant toute suite d'intégration. Après un ajout de dépendance, `pnpm docker:up` reconstruit
  les images.
- Rien de local dans ce qui se publie (`localhost`, ports, chemins du poste), aucune
  attribution.

## Review Focus

Les cinq entrées que la spec implique sans qu'aucune tâche ne les éprouve d'elle-même. Le
test qui fixe chacune est ajouté à la tâche qui porte le code.

1. **Une poignée de main venue d'une origine inconnue**, ou de l'administration : refusée,
   aucune salle rejointe. Test en tâche 4.
2. **Un vendeur qui achète aussi**, connecté aux deux fronts : son onglet de la boutique ne
   reçoit rien de sa boutique, son onglet vendeur rien de ses achats. Test en tâche 4.
3. **Un événement dont l'objet a disparu** entre le dépôt et la consommation : abandonné sans
   erreur, sans relance infinie de la file. Test en tâche 4.
4. **Redis injoignable au moment du dépôt**, ou `REDIS_URL` absente : l'action rend son
   résultat normal. Test en tâche 2.
5. **Un webhook rejoué, ou un événement `PENDING` du prestataire** : rien n'est émis, l'état
   de paiement de la commande n'ayant pas bougé. Test en tâche 5.

---

### Task 1 : le vocabulaire des événements, et la règle « qui prévenir »

**Files:**
- Create : `packages/core/src/enums/realtime-event.enum.ts`
- Create : `packages/core/src/interfaces/realtime-event.interface.ts`
- Create : `packages/core/src/constants/realtime.constant.ts`
- Modify : les `index.ts` de `enums/`, `interfaces/`, `constants/` de `packages/core`
- Create : `packages/domain/src/utils/realtime-recipients.utils.ts` et son `.spec.ts`
- Modify : `packages/domain/src/utils/index.ts`

**Interfaces:**
- Produces, dans `@clemperl/core` :
  - `E_REALTIME_EVENT = { ORDER_PLACED: "order.placed", ORDER_STATUS_CHANGED: "order.status_changed", PAYMENT_STATUS_CHANGED: "payment.status_changed", PRODUCT_IMAGE_PROCESSED: "product_image.processed", DISPUTE_OPENED: "dispute.opened", DISPUTE_MESSAGE_POSTED: "dispute.message_posted", DISPUTE_DECIDED: "dispute.decided", DISPUTE_SERVED: "dispute.served" } as const`, et `TRealtimeEventKind`.
  - `TRealtimeEvent`, union discriminée sur `kind` :
    `{ kind: "order.placed"; orderId }`, `{ kind: "order.status_changed"; orderId; by: "VENDOR" | "ADMIN" }`,
    `{ kind: "payment.status_changed"; orderId; by: "VENDOR" | "PROVIDER" }`,
    `{ kind: "product_image.processed"; imageId }`, `{ kind: "dispute.opened"; disputeId }`,
    `{ kind: "dispute.message_posted"; disputeId; by: "BUYER" | "VENDOR" }`,
    `{ kind: "dispute.decided"; disputeId }`, `{ kind: "dispute.served"; disputeId }`, tous les identifiants en `string`.
  - `IRealtimeNotice { kind: TRealtimeEventKind; reference?: string; productTitle?: string; imageStatus?: "READY" | "FAILED" }` : ce que reçoit le navigateur.
  - `REALTIME_EVENTS_QUEUE = "realtime-events"` et `REALTIME_SOCKET_EVENT = "realtime"`.
- Produces, dans `@clemperl/domain` :
  `realtimeRecipients(event: TRealtimeEvent): readonly ("BUYER" | "SHOP")[]`.

Le vocabulaire vit dans `packages/core` parce que les fronts, qui déposent, et l'API, qui émet,
le partagent, et que `core` est le seul paquet qu'importent les deux sans cycle. La règle de
destination est du métier : elle vit dans `packages/domain`.

| Événement | Destinataires |
| --- | --- |
| `order.placed` | `SHOP` |
| `order.status_changed`, `by: VENDOR` | `BUYER` |
| `order.status_changed`, `by: ADMIN` | `BUYER`, `SHOP` |
| `payment.status_changed`, `by: VENDOR` | `BUYER` |
| `payment.status_changed`, `by: PROVIDER` | `BUYER`, `SHOP` |
| `product_image.processed` | `SHOP` |
| `dispute.opened` | `SHOP` |
| `dispute.message_posted`, `by: BUYER` | `SHOP` |
| `dispute.message_posted`, `by: VENDOR` | `BUYER` |
| `dispute.decided` | `BUYER`, `SHOP` |
| `dispute.served` | `SHOP` |

- [ ] **Step 1 : écrire le test de la règle**, un cas par ligne du tableau, attentes en
  littéraux : par exemple `expect(realtimeRecipients({ kind: "payment.status_changed", orderId: "o1", by: "VENDOR" })).toEqual(["BUYER"])`.
- [ ] **Step 2 : voir échouer.** Run : `pnpm --filter @clemperl/domain test`. Attendu : FAIL,
  module absent.
- [ ] **Step 3 : écrire le vocabulaire dans `core`, puis la règle dans `domain`**, par un
  `switch` exhaustif sur `kind` que TypeScript vérifie (`never` dans le `default`).
- [ ] **Step 4 : voir passer.** Run : `pnpm turbo run build --filter='./packages/*'` puis
  `pnpm turbo run test lint typecheck --filter=@clemperl/core --filter=@clemperl/domain`.
  Attendu : vert, couverture 100 %.

---

### Task 2 : déposer un événement, sans jamais faire échouer l'écriture

**Files:**
- Modify : `packages/core/package.json` (ajout de `bullmq` 6.3.8, la version de l'API)
- Create : `packages/core/src/utils/realtime-publisher.utils.ts` et son `.spec.ts`
- Modify : `packages/core/src/utils/index.ts`

**Interfaces:**
- Consumes : `TRealtimeEvent`, `REALTIME_EVENTS_QUEUE` (tâche 1), `redisConnectionOptions`.
- Produces : `publishRealtimeEvent(event: TRealtimeEvent): Promise<void>`, qui **ne rejette
  jamais**.

Une file ouverte une fois par processus, à la demande, sur le modèle de `productImageQueue`
dans l'espace vendeur. Options de dépôt : `attempts: 3`, `backoff: { type: "exponential", delay: 1000 }`,
`removeOnComplete: true`, `removeOnFail: 100`. Toute erreur, `REDIS_URL` absente comprise,
est journalisée par `console.error` et avalée : l'écriture est déjà faite.

`bullmq` entre dans `packages/core`, ce que « Ce qui casse si on se trompe » signale comme
risqué. Le risque nommé est un paquet que l'on ne peut plus importer partout ; `core` ne
s'importe déjà que côté serveur, puisqu'il porte nodemailer et le client de stockage, et
`bullmq` y entre à la version déjà employée par l'API et l'espace vendeur. Le dire dans le
commentaire du fichier.

- [ ] **Step 1 : écrire les tests**, `bullmq` simulé par `vi.mock` :
  - dépose sur la file `realtime-events`, avec l'événement tel quel et les options ci-dessus ;
  - n'ouvre qu'une file pour deux dépôts ;
  - **résout sans rejeter quand `add` rejette** (Review Focus 4), et journalise ;
  - **résout sans rejeter quand `REDIS_URL` est absente** (Review Focus 4).
- [ ] **Step 2 : voir échouer.** Run : `pnpm --filter @clemperl/core test`.
- [ ] **Step 3 : écrire `publishRealtimeEvent`, ajouter la dépendance**, `pnpm install` à la
  racine.
- [ ] **Step 4 : voir passer**, couverture de `core` à 100 %.

---

### Task 3 : les lectures qui disent qui prévenir

**Files:**
- Create : `packages/db/src/repositories/realtime.repository.ts`, exporté par le baril
- Modify : `packages/db/src/repositories/order.repository.ts` (`placeOrders`)
- Modify : `packages/db/src/repositories/payment.repository.ts` (`applyProviderEvent`)
- Test : `apps/api/test/realtime.int-spec.ts` (créé ici), et les suites existantes de
  `placeOrders` et `applyProviderEvent` mises à jour

**Interfaces:**
- Produces :
  - `readOrderAudience(prisma, orderId: string): Promise<{ buyerId: string; vendorId: string; reference: string } | null>`
  - `readDisputeAudience(prisma, disputeId: string): Promise<{ buyerId: string; vendorId: string; reference: string } | null>`, par la commande du litige
  - `readProductImageAudience(prisma, imageId: string): Promise<{ vendorId: string; productTitle: string; status: string } | null>`
  - `listVendorIdsForMember(prisma, userId: string): Promise<string[]>`, boutiques non
    fermées (`deletedAt: null`), triées par identifiant
  - `placeOrders` rend `{ references: string[]; orderIds: string[] }`, les deux dans le même
    ordre
  - `applyProviderEvent` rend `{ changed: boolean; orderId: string | null }`, `orderId` nul
    quand aucune tentative ne correspond

Ces lectures ne portent AUCUNE portée de lecteur, et c'est voulu : seul le service de l'API
les appelle, pour décider à qui émettre, jamais pour rendre une donnée à un écran. Le dire en
tête du fichier, et ne jamais les appeler depuis un front.

- [ ] **Step 1 : écrire les tests d'intégration** : l'audience d'une commande, d'un litige,
  d'une image ; `null` pour un identifiant inconnu ; les boutiques d'un membre de deux
  boutiques, la boutique fermée exclue ; `placeOrders` rend un `orderId` par référence, dans
  l'ordre ; `applyProviderEvent` rend l'`orderId` de la tentative.
- [ ] **Step 2 : voir échouer.**
  Run : `docker exec clemperl_dev_api sh -c "cd /app/apps/api && pnpm exec jest --config jest.config.integration.ts --runInBand realtime"`.
- [ ] **Step 3 : écrire les lectures, étendre les deux retours**, rebâtir `@clemperl/db` dans
  le conteneur.
- [ ] **Step 4 : voir passer, puis toute la couche d'intégration.** Les suites de T3 et T4 qui
  lisent `{ references }` et `{ changed }` doivent rester vertes : un retour élargi, pas changé.

---

### Task 4 : le module temps réel de l'API

**Files:**
- Modify : `apps/api/package.json` (`@nestjs/websockets` et `@nestjs/platform-socket.io`
  12.0.3, `@socket.io/redis-adapter` 8.3.0)
- Create, sous `apps/api/src/modules/realtime/` :
  - `realtime.module.ts`
  - `controllers/realtime.gateway.ts` : la passerelle est l'entrée des navigateurs, d'où
    `controllers/` et non un dossier hors de la convention NestJS du dépôt
  - `services/realtime.service.ts`
  - `processors/realtime-events.processor.ts`
  - `utils/realtime-app.utils.ts`, `utils/realtime-rooms.utils.ts`
  - `adapters/redis-io.adapter.ts`
  - les `index.ts` de chaque sous-dossier, aucun à la racine du module
- Modify : `apps/api/src/app.module.ts` (import du module), `apps/api/src/main.ts` (adaptateur)
- Modify : `apps/api/jest.config.ts` (exclusion de couverture de l'adaptateur, motivée)
- Test : un `.spec.ts` à côté de chaque fichier, sauf le module et l'adaptateur

**Interfaces:**
- Consumes : tâches 1 et 3 ; `AUTH_TOKEN` et l'instance Better Auth de `AuthModule` ;
  `toOrigin` de `payments/utils`.
- Produces :
  - `appForOrigin(origin: string | undefined, env: NodeJS.ProcessEnv): "storefront" | "vendor" | null`,
    par comparaison exacte à `toOrigin` de `NEXT_PUBLIC_STOREFRONT_URL` et de
    `NEXT_PUBLIC_VENDOR_URL` ; l'administration et toute autre origine rendent `null`
  - `userRoom(userId: string): string` → `user:<id>` ; `shopRoom(vendorId: string): string` → `shop:<id>`
  - `RealtimeGateway.handleConnection(socket)` : refuse (déconnecte) sans origine reconnue ou
    sans session ; la boutique rejoint `userRoom`, l'espace vendeur `shopRoom` de chaque
    boutique de `listVendorIdsForMember` ; `emitTo(rooms: string[], notice: IRealtimeNotice): void`
  - `RealtimeService.publish(event: TRealtimeEvent): Promise<void>`, qui ne rejette jamais :
    relit l'audience, applique `realtimeRecipients`, compose l'`IRealtimeNotice`, émet
    `REALTIME_SOCKET_EVENT` ; un objet disparu est abandonné sans erreur
  - `RealtimeEventsProcessor` : `@Processor(REALTIME_EVENTS_QUEUE)`, `process(job)` appelle
    `publish(job.data)`
  - `RealtimeModule` exporte `RealtimeService`
  - `RedisIoAdapter extends IoAdapter` : `connect(redisUrl: string): Promise<void>` ouvre deux
    clients ioredis, `createIOServer` applique `createAdapter(pub, sub)`

La session se demande à l'instance Better Auth à partir des en-têtes de la poignée de main
(`socket.handshake.headers`), exactement comme `SessionGuard` le fait des en-têtes HTTP. Les
gardes HTTP ne s'appliquent pas à une poignée de main : ne pas les réutiliser par
`@UseGuards`. La passerelle déclare `cors: { origin: allowedOrigins(process.env), credentials: true }`
et le transport `websocket` seul : le transport par interrogation demanderait des sessions
collantes entre exemplaires.

L'adaptateur s'installe dans `main.ts`, après `createApp` : `createApp` sert aussi aux suites
supertest, qui n'ont pas besoin de Redis. `main.ts` est déjà hors couverture ; l'adaptateur
l'est aussi, avec la raison en commentaire dans `jest.config.ts` : il ne s'éprouve qu'avec un
vrai Redis et deux serveurs, et c'est le parcours navigateur qui le prouve en marche.

- [ ] **Step 1 : écrire les tests unitaires**, Better Auth, le dépôt et le serveur Socket.IO
  simulés :
  - `appForOrigin` : la boutique, l'espace vendeur, `null` pour l'administration, pour une
    origine inconnue et pour une origine absente (Review Focus 1) ;
  - la passerelle déconnecte sans session, et sans origine reconnue (Review Focus 1), sans
    rejoindre de salle ;
  - **un même compte** : depuis la boutique, il rejoint `user:<id>` et aucune `shop:` ; depuis
    l'espace vendeur, chaque `shop:` et pas `user:` (Review Focus 2) ;
  - le service émet vers `user:<buyerId>` et/ou `shop:<vendorId>` selon la règle, pour chaque
    genre, avec la référence ou le titre et l'état de l'image dans l'avis ;
  - **un objet disparu** : aucune émission, la promesse résout, rien n'est relevé vers la file
    (Review Focus 3) ;
  - le processeur passe `job.data` au service.
- [ ] **Step 2 : voir échouer.** Run : `pnpm --filter @clemperl/api test`.
- [ ] **Step 3 : ajouter les dépendances, écrire le module**, l'importer dans `AppModule`,
  installer l'adaptateur dans `main.ts`.
- [ ] **Step 4 : voir passer, couverture à 100 %, `lint`, `typecheck`, `build` de l'API.**

---

### Task 5 : ce que l'API écrit elle-même émet directement

**Files:**
- Modify : `apps/api/src/modules/payments/services/payments.service.ts` et son `.spec.ts`
- Modify : `apps/api/src/modules/payments/payments.module.ts` (import de `RealtimeModule`)
- Modify : `apps/api/src/modules/media/processors/product-image.processor.ts`
- Modify : `apps/api/src/modules/media/media.module.ts` (import de `RealtimeModule`)

**Interfaces:**
- Consumes : `RealtimeService.publish` (tâche 4), les retours élargis de la tâche 3.

- `receive()` : après `applyProviderEvent`, émet `payment.status_changed`, `by: PROVIDER`,
  **seulement si** `changed` est vrai, l'`orderId` connu, et le statut reçu autre que
  `PENDING` : un événement en attente ne change pas l'état de paiement de la commande.
- `settle()` : après `settleOffline`, émet `payment.status_changed`, `by: VENDOR`.
- Le processeur d'images émet `product_image.processed` après `markImageReady` et après chacun
  de ses `markImageFailed`, y compris dans `onFailed`, sous la même garde `try/catch` que
  celle qui y protège déjà le processus.

- [ ] **Step 1 : écrire les tests** dans `payments.service.spec.ts` : un webhook qui règle émet
  une fois, `by: PROVIDER` ; **un webhook rejoué (`changed: false`) et un statut `PENDING`
  n'émettent rien** (Review Focus 5) ; un pointage hors ligne émet `by: VENDOR`.
- [ ] **Step 2 : voir échouer.** Run : `pnpm --filter @clemperl/api test`.
- [ ] **Step 3 : écrire les émissions**, et importer `RealtimeModule` dans les deux modules.
- [ ] **Step 4 : voir passer**, couverture de l'API à 100 %. Le processeur d'images est hors
  couverture unitaire : sa suite d'intégration `product-image-worker.int-spec.ts` doit rester
  verte, et le parcours navigateur de la tâche 8 prouve
  l'émission.

---

### Task 6 : les trois fronts déposent leurs événements

**Files:**
- Modify : `apps/storefront/src/app/[locale]/checkout/actions.ts` ; Create : son `.spec.ts`
- Modify : `apps/storefront/src/app/[locale]/orders/[reference]/dispute/actions.ts` et son `.spec.ts`
- Modify : `apps/vendor/src/app/orders/[id]/actions.ts` ; Create : son `.spec.ts`
- Modify : `apps/vendor/src/app/orders/[id]/dispute-actions.ts` et son `.spec.ts`
- Modify : `apps/admin/src/app/orders/[id]/actions.ts` et son `.spec.ts`
- Modify : `apps/admin/src/app/disputes/[id]/actions.ts` et son `.spec.ts`

**Interfaces:**
- Consumes : `publishRealtimeEvent` (tâche 2), `placeOrders` élargi (tâche 3).

| Action | Après | Dépôt |
| --- | --- | --- |
| `submitCheckout` | `placeOrders` | `order.placed`, un par `orderId` |
| `advanceOrderAction` | `setOrderStatus` | `order.status_changed`, `by: VENDOR` |
| `advance` (administration) | `setOrderStatusAsAdministrator` | `order.status_changed`, `by: ADMIN` |
| `openDisputeAction` | `openDispute` | `dispute.opened` |
| `replyToDisputeAction` | `postDisputeMessageAsBuyer` | `dispute.message_posted`, `by: BUYER` |
| `replyToDisputeAsVendorAction` | `postDisputeMessageAsVendor` | `dispute.message_posted`, `by: VENDOR` |
| `decide` | `decideDispute` | `dispute.decided` |
| `markServedAction` | `markDisputeServed` | `dispute.served` |

Chaque dépôt vient après l'écriture réussie et avant `revalidatePath` ou `redirect`, et **seulement
après une écriture réussie** : un refus ne dépose rien. Il n'est enveloppé d'aucun `try` : c'est
`publishRealtimeEvent` qui garantit de ne jamais rejeter, éprouvé une fois en tâche 2.

- [ ] **Step 1 : écrire les tests**, `publishRealtimeEvent` simulé dans le mock de
  `@clemperl/core` : pour chaque action du tableau, le dépôt attendu après une écriture
  réussie, et AUCUN dépôt quand l'écriture est refusée. Pour `submitCheckout`, deux commandes
  créées donnent deux dépôts, un par `orderId`.
- [ ] **Step 2 : voir échouer**, Run : `pnpm --filter <application> test` pour les trois.
- [ ] **Step 3 : écrire les dépôts.**
- [ ] **Step 4 : voir passer, `lint`, `typecheck`, `build` des trois applications.**

---

### Task 7 : le navigateur écoute, alerte et rafraîchit

**Files:**
- Modify : `apps/storefront/package.json`, `apps/vendor/package.json` (`socket.io-client` 4.8.4)
- Create : `apps/storefront/src/app/[locale]/components/realtime-listener.tsx`
- Create : `apps/vendor/src/app/components/realtime-listener.tsx`
- Modify : `apps/storefront/src/app/[locale]/layout.tsx`, `apps/vendor/src/app/layout.tsx`
- Delete : `apps/storefront/src/app/[locale]/orders/[reference]/components/payment-watch.tsx`
- Modify : `apps/storefront/src/app/[locale]/orders/[reference]/page.tsx`
- Modify : `apps/vendor/src/app/products/[id]/images/product-images.tsx`
- Modify : `packages/i18n/messages/storefront/fr.json`, `en.json`, `packages/i18n/messages/vendor/fr.json`

**Interfaces:**
- Consumes : `IRealtimeNotice`, `REALTIME_SOCKET_EVENT` (tâche 1), en import de TYPE et de
  constante seulement, la passerelle (tâche 4).
- Produces : `RealtimeListener({ apiUrl }: { apiUrl: string })`, dans chaque application ;
  le marqueur d'attente `data-realtime-waiting`.

Le composant ouvre `io(apiUrl, { withCredentials: true, transports: ["websocket"] })`, une fois
par onglet. Dans la boutique, seulement quand une session existe, lue par `authClient.useSession()`
de `apps/storefront/src/lib/auth-client.ts` ; dans l'espace vendeur, toujours, toutes ses pages
exigeant une appartenance. `apiUrl` vient de `NEXT_PUBLIC_API_URL`, lue par la mise en page côté
serveur et passée en prop, comme `PayButton` la reçoit.

À chaque avis : une alerte dans une région `role="status"` `aria-live="polite"`, qui s'efface
après quelques secondes, texte par genre depuis le catalogue (`realtime.<genre>`, avec la
référence, le titre ou l'état de l'image) ; puis `router.refresh()`. À la reconnexion :
`router.refresh()` une fois. À la première connexion : `router.refresh()` une fois **seulement
si** la page porte un élément `[data-realtime-waiting]`.

Le marqueur remplace l'interrogation : la page de commande le rend quand `awaiting` est vrai, à
la place de `<PaymentWatch>` ; la page des photos le rend tant qu'une image est en attente, et
sa boucle `setInterval` disparaît.

- [ ] **Step 1 : écrire les tests** de chaque `RealtimeListener` avec un `socket.io-client`
  simulé : un avis affiche son texte et rafraîchit ; une reconnexion rafraîchit ; la première
  connexion ne rafraîchit pas sans marqueur, et rafraîchit avec ; la boutique ne se connecte
  pas sans session. Les deux applications n'ont pas encore de tests de composant : ajouter
  `@testing-library/react` et `jsdom` en dépendances de développement, à la version de
  `packages/ui`, et un `vitest.config.ts` minimal par application, sur le modèle de celui de
  `packages/ui`.
- [ ] **Step 2 : voir échouer.** Run : `pnpm --filter @clemperl/storefront test` et
  `pnpm --filter @clemperl/vendor test`.
- [ ] **Step 3 : écrire les composants, les libellés, retirer l'interrogation**,
  `pnpm install` à la racine.
- [ ] **Step 4 : voir passer, `lint`, `typecheck`, `build`.** Vérifier par `grep` que
  `setInterval` n'apparaît plus dans `payment-watch` (supprimé) ni dans `product-images.tsx`.

---

### Task 8 : le parcours navigateur, la passation

**Files:**
- Create : `e2e/realtime.spec.ts`
- Modify : `docs/passation.md`, `docs/pieges.md` si un piège est payé

`pnpm docker:up` : les images se reconstruisent avec les nouvelles
dépendances, et le schéma n'a pas changé.

Le parcours, d'un seul tenant, chaque page restant ouverte sans rechargement :

1. une boutique validée publie un produit ; le vendeur reste **sur la page de ses produits** ;
2. un acheteur commande : le vendeur voit l'alerte de nouvelle commande, sans recharger ;
3. l'acheteur reste sur la page de sa commande ; le vendeur l'accepte puis l'expédie dans son
   espace : la page de l'acheteur passe à « Expédiée », avec l'alerte, sans recharger ;
4. le vendeur pointe le paiement hors ligne : la page de l'acheteur affiche le paiement reçu.

Les parcours existants qui dépendaient de l'interrogation, la page de paiement et la page des
photos (`vendor-product-images.spec.ts`), doivent rester verts : c'est désormais le temps réel
qui les fait avancer.

- [ ] **Step 1 : écrire le parcours.**
- [ ] **Step 2 : le lancer seul**, `pnpm test:e2e e2e/realtime.spec.ts --workers=1`, trois fois.
- [ ] **Step 3 : la vérification d'ensemble** : `pnpm lint`, `pnpm typecheck`,
  `pnpm turbo run test`, `pnpm verify:thresholds`, `pnpm turbo run build`, la couche
  d'intégration dans le conteneur, la suite navigateur complète en `--workers=1`. Arrêter la
  pile.
- [ ] **Step 4 : la passation** : T6d « Livrée, PR #15 » et T7 dans le tableau ; une section
  « T7 est livrée » sur la forme de celle de T6d, avec les décisions, les non-buts, les
  décomptes et ce que la vérification n'a pas établi ; les deux balayages planifiés rattachés à
  une tranche ultérieure plutôt qu'à T7.
- [ ] **Step 5 : le commit de chantier**, que le propriétaire passe ou autorise.
