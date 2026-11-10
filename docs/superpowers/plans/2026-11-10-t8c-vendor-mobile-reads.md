# T8c, les lectures : plan d'implémentation

> **Pour les agents :** sous-skill requis : superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes se cochent
> (`- [ ]`). La tâche 5 est la pièce du propriétaire : le constructeur y écrit les tests,
> les voit échouer, et s'arrête.

**Objectif :** le commerçant lit sur son téléphone la liste de ses commandes, le détail d'une
commande et la liste de ses produits, comme l'espace vendeur web les montre, et rien d'une autre
boutique.

**Architecture :** trois requêtes GraphQL dans deux modules métier neufs de l'API, `orders` et
`products`, derrière deux gardes en chaîne : `SessionGuard`, puis `ShopGuard`, qui lit la
boutique du compte par `readVendorForMember`, la fonction de `me` et de l'espace vendeur web. Les
résolveurs appellent les fonctions du dépôt que les pages web appellent déjà
(`listOrdersForVendor`, `readOrderForVendor`, `listProductsForVendor`), et le domaine pour ce qui
est une règle (`allowedOrderActions`, `formatPrice`, et `disputeNotice`, extraite de la liste
web). Le téléphone gagne trois écrans Expo Router, ouverts depuis l'accueil.

**Pile :** rien de neuf. Aucune dépendance ajoutée, aucune migration, aucune variable
d'environnement.

**Spec :** `docs/superpowers/specs/2026-10-23-t8-mobile-vendeur-design.md`, sections 2, 3 (T8c),
4 à 8. Lire aussi `docs/graphql.md`, `docs/expo.md`, `docs/conventions/nestjs.md` et
`docs/conventions/code.md` avant la tâche 1.

## Contraintes globales

- Un résolveur appelle le dépôt et le domaine, jamais Prisma directement, et ne recopie aucune
  règle : ni l'appartenance, ni une transition, ni le format d'un montant.
- Toute requête de T8c porte `@UseGuards(SessionGuard, ShopGuard)`, dans cet ordre.
- Une commande d'une autre boutique, ou un identifiant inventé, rend `null`, comme une commande
  qui n'existe pas. Jamais une erreur, qui confirmerait qu'elle existe.
- Un DTO se remplit champ par champ, jamais par recopie d'un objet du dépôt (le commentaire de
  `MeResolver` dit pourquoi).
- Le téléphone n'importe aucun paquet du monorepo hors catalogues JSON. Un état s'affiche par
  la clé du catalogue de l'application, indexée par la valeur de l'énumération GraphQL.
- Les deux catalogues ont les mêmes clés. Le français reprend le libellé de l'espace vendeur web
  quand il en a un (`packages/i18n/messages/vendor/fr.json`).
- Côté téléphone, un type métier ne vit pas dans un `.tsx` (`docs/conventions/code.md`) : il va
  dans `types/` ou s'importe des types générés.
- Après chaque changement de type ou de résolveur : `schema.gql` réimprimé dans le conteneur,
  puis `codegen` côté téléphone.
- Un changement de `packages/domain` n'atteint l'API qu'après
  `pnpm turbo run build --filter=@clemperl/domain` et `docker restart clemperl_dev_api`
  (`docs/pieges.md`).
- Chaque notion neuve entre dans `docs/graphql.md` ou `docs/expo.md` dans la tâche qui la pose,
  au format des sections existantes, avec le renvoi au fichier qui la montre. Le propriétaire
  les lit avant la tâche 5.
- Pas de tiret quadratin ni demi-cadratin. Code en anglais, commentaires et documentation en
  français.
- Un seul commit pour la marche, avec ce plan et la passation déjà modifiée. Aucune écriture
  Git sans l'accord du propriétaire. La branche `feat/vendor-mobile-reads` existe.

## Décisions de ce plan, à relire

La spec en laisse plusieurs au constructeur (section 9). Le propriétaire peut contester chacune
avant la tâche 1.

1. **Un compte sans boutique reçoit `FORBIDDEN`** de `ShopGuard`, et non une liste vide. Le
   téléphone n'interroge jamais sans boutique, l'accueil l'arrête avant ; si l'appartenance
   disparaît pendant que l'application est ouverte, l'écran revient à l'accueil, qui affiche
   « Aucune boutique ». Les écritures de T8d réutilisent la même garde.
2. **Les montants arrivent formatés par l'API**, par `formatPrice` et dans la devise de la
   commande : le téléphone ne recopie pas la règle des décimales par devise. En français pour
   l'instant, l'API ne connaissant pas encore la langue du téléphone ; le contexte de requête
   de T8d la lui donnera.
3. **Les dates arrivent en `DateTime` ISO** et le téléphone les formate dans sa langue : afficher
   une date n'est pas une règle de ClemPerl.
4. **Le signal de litige devient une règle du domaine**, `disputeNotice` : un litige ouvert, ou
   tranché pour le client et donc à servir, est signalé. La liste web la recopiait dans son
   JSX ; elle l'appelle désormais, et le téléphone reçoit le résultat.
5. **Le détail ne montre ni l'historique des tentatives de paiement, ni le fil du litige**, qui
   restent sur le web (spec, section 5). L'API expose déjà les actions permises ; le téléphone
   ne les demande qu'en T8d, avec leurs boutons.
6. **Un produit montre son titre et son état**, comme le dit la spec, sans la fourchette de prix
   ni le nombre de variantes de la page web.
7. **L'avis de boutique suspendue reste à l'accueil**, au lieu d'être répété sur chaque écran.
8. **L'accueil ouvre « Commandes » et « Produits » par deux boutons**, et ces écrans montrent
   l'en-tête natif d'Expo Router, avec son retour.

## Points de vigilance

Chacun a son test dans la tâche indiquée.

1. **Un identifiant de commande inventé, mal formé ou d'une autre boutique**, tapé dans le
   terrain de jeu : `order` rend `null` sans erreur, et le téléphone dit « Cette commande est
   introuvable » : tâches 3 et 4.
2. **Un compte qui n'a pas ou plus de boutique** : `FORBIDDEN` sur chaque lecture, et le
   téléphone revient à l'accueil : tâches 1 et 2.
3. **Une session expirée sur un écran de liste** : retour à la connexion, sans message
   technique : tâche 2.
4. **Une boutique neuve, sans commande ni produit** : la phrase du catalogue, pas un écran
   vide : tâches 2 et 5.
5. **Une commande passée dans une devise à zéro décimale**, ou que la boutique a quittée
   depuis : le total suit la devise de la commande : tâche 1.

---

### Tâche 1 : la garde de boutique, et la liste des commandes dans l'API

**Fichiers :**
- Créer : `apps/api/src/modules/auth/utils/request-of.utils.ts` et `utils/index.ts`, où
  `requestOf` quitte `session.guard.ts` ; `interfaces/guarded-request.interface.ts`, où va
  `IGuardedRequest`, désormais partagé ; `interfaces/shop-request.interface.ts`
- Créer : `apps/api/src/modules/auth/guards/shop.guard.ts` et son `.spec.ts`
- Modifier : `guards/index.ts`, `interfaces/index.ts`, `auth.module.ts` (fournit et exporte
  `ShopGuard`)
- Modifier : `packages/domain/src/constants/dispute.constant.ts`,
  `packages/domain/src/utils/dispute.utils.ts` et son `.spec.ts`
- Modifier : `apps/vendor/src/app/orders/page.tsx`
- Créer : `apps/api/src/modules/orders/orders.module.ts`, `resolvers/orders.resolver.ts` et son
  `.spec.ts`, `dto/response/order-summary.dto.ts`, `dto/response/order-enums.dto.ts`, leurs
  `index.ts`
- Modifier : `apps/api/src/app.module.ts`, `apps/api/src/modules/graphql/schema.gql` (réimprimé)
- Créer : `apps/api/test/vendor-reads.e2e-spec.ts`
- Modifier : `docs/graphql.md`

**Interfaces :**
- Produit : `requestOf(context: ExecutionContext): IGuardedRequest`, exporté de `auth/utils`.
- Produit : `interface IShopRequest extends ISessionRequest { shop: { id: string } }`.
- Produit : `ShopGuard implements CanActivate`, posé après `SessionGuard` : lit
  `readVendorForMember(prisma, request.session.user.id)`, attache `request.shop = { id }`, et
  lève `ForbiddenException` quand le compte n'a pas de boutique.
- Produit : `E_DISPUTE_NOTICE = { OPEN: "OPEN", TO_SERVE: "TO_SERVE" } as const`, son type
  `TDisputeNotice`, et `disputeNotice(status: TDisputeStatus | null): TDisputeNotice | null`.
- Produit, au schéma : les énumérations `OrderStatus` et `PaymentStatus`, publiées par
  `registerEnumType` sur `E_ORDER_STATUS` et `E_PAYMENT_STATUS` de `@clemperl/db/enums`, et
  `DisputeNotice` sur `E_DISPUTE_NOTICE` ; `order-enums.dto.ts` les enregistre toutes, une fois.
- Produit, au schéma : `OrderSummary { id: ID!, reference: String!, customerName: String!,
  status: OrderStatus!, paymentStatus: PaymentStatus!, total: String!, placedAt: DateTime!,
  dispute: DisputeNotice }` et `Query.orders: [OrderSummary!]!`.
- Produit : `OrdersResolver.orders(request: IShopRequest): Promise<OrderSummaryDto[]>`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`shop.guard.spec.ts`, `@clemperl/db` simulé comme dans `me.resolver.spec.ts` :
- `it("attache la boutique du compte")` : `readVendorForMember` rend `{ id: "v1", … }` ; la garde
  rend `true`, `request.shop` vaut `{ id: "v1" }`, l'appel a reçu `({ marker: "prisma" }, "u1")` ;
- `it("refuse un compte sans boutique")` : `null` lève `ForbiddenException` ;
- `it("lit la requête d'un résolveur")` : un contexte de type `graphql` porte la requête sous
  `req`, et c'est elle qui reçoit `shop`.

`dispute.utils.spec.ts` :
- `it("signale un litige ouvert")` : `OPEN` donne `"OPEN"` ;
- `it("signale un litige tranché pour le client, qui reste à servir")` : `DECIDED_FOR_BUYER`
  donne `"TO_SERVE"` ;
- `it("ne signale ni un litige tranché pour la boutique, ni un litige servi, ni l'absence de
  litige")` : `DECIDED_FOR_VENDOR`, `SERVED` et `null` donnent `null`.

`orders.resolver.spec.ts`, `listOrdersForVendor` simulé, `formatPrice` réel :
- `it("rend les commandes de la boutique, champ par champ")` : une ligne du dépôt, avec
  `paymentMethod` en trop, donne exactement `{ id, reference, customerName: <shipToName>,
  status, paymentStatus, total: formatPrice(5000, "EUR"), placedAt: <createdAt>, dispute: null }`,
  et le dépôt a reçu `({ marker: "prisma" }, "v1")` ;
- `it("formate le total dans la devise de la commande")` : `currency: "XOF"` donne
  `formatPrice(5000, "XOF")` ;
- `it("signale un litige à servir")` : `dispute: { status: "DECIDED_FOR_BUYER" }` donne
  `dispute: "TO_SERVE"` ;
- `it("se publie dans le schéma sous les noms du contrat")`, sur le modèle de celui de `me` :
  `orders` est `[OrderSummary!]!`, `OrderSummary.status` est `OrderStatus!`, `dispute` est
  `DisputeNotice`.

`vendor-reads.e2e-spec.ts`, `describe("orders")`, sur le modèle de `graphql.e2e-spec.ts`. Ce
fichier tient les deux rôles que la spec demande (section 8) : il passe par `/graphql` avec de
vraies sessions, contre la vraie base, et c'est lui qui prouve le bornage à la boutique. Les
commandes se créent comme `placedOrder` dans `order-oversight.int-spec.ts` (`createShop`,
`publishedVariant`, panier, `placeOrders`), recopié dans le fichier comme chaque spec le fait, et
le compte de `openSession` devient membre par `prisma.vendorMember.create` :
- `it("refuse orders sans session")` : `UNAUTHENTICATED` ;
- `it("refuse orders à un compte sans boutique")` : `data` vaut `null`,
  `errors[0].extensions.code` vaut `FORBIDDEN` ;
- `it("rend les commandes de la boutique, la plus récente en tête, et aucune d'une autre")` :
  deux commandes sur la boutique A, l'une après l'autre, une sur la boutique B ; le membre de A
  lit exactement les deux références de A, la seconde en tête.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/api test` et `pnpm --filter @clemperl/domain test`
Attendu : échec, `ShopGuard`, `OrdersResolver` et `disputeNotice` introuvables.

- [ ] **Étape 3 : implémenter**

`ShopGuard` est une garde à part et non une seconde lecture dans `SessionGuard` : `me` doit
répondre à un compte sans boutique, les lectures de boutique non. Son commentaire dit pourquoi
`FORBIDDEN` plutôt qu'une liste vide (décision 1). `placedAt` se déclare
`@Field(() => GraphQLISODateTime)`. Le commentaire de `total` dit pourquoi l'API formate
(décision 2). `OrdersModule` importe `AuthModule` ; `AppModule` importe `OrdersModule`.

La liste web remplace sa condition par `disputeNotice(order.dispute?.status ?? null)`, et
choisit `messages.disputes.badge` pour `OPEN`, `badgeToServe` pour `TO_SERVE` ; le
`data-testid` ne change pas.

- [ ] **Étape 4 : réimprimer le schéma, puis vérifier**

Run : `pnpm turbo run build --filter=@clemperl/domain`, `docker restart clemperl_dev_api`, puis
`docker exec clemperl_dev_api sh -c "cd apps/api && pnpm schema:print"` et
`docker exec clemperl_dev_api sh -c "cd apps/api && pnpm exec jest --config jest.config.e2e.ts --runInBand"`
Attendu : la couche e2e entière passe, `graphql-schema.e2e-spec.ts` compris.

Run : `pnpm --filter @clemperl/api test`, `pnpm --filter @clemperl/domain test`,
`pnpm --filter @clemperl/vendor test`, puis `lint` et `typecheck` des trois
Attendu : tout passe, couverture 100 % pour l'API et le domaine.

Run : `pnpm test:e2e e2e/disputes.spec.ts --workers=1`
Attendu : vert ; le badge « Litige tranché : client à servir » de la liste web y est asserté.

- [ ] **Étape 5 : le guide**

`docs/graphql.md` gagne trois sections : une liste et ses deux points d'exclamation
(`[OrderSummary!]!`) ; une énumération publiée par `registerEnumType`, que le téléphone traduit
par la clé de son catalogue ; deux gardes en chaîne et l'erreur `FORBIDDEN`.

---

### Tâche 2 : la liste des commandes sur le téléphone

**Fichiers :**
- Créer : `apps/vendor-mobile/src/types/query-failure.type.ts`, `src/lib/query-failure.ts` et
  son `.spec.ts`
- Modifier : `src/features/session/me-state.ts`, qui s'en sert
- Créer : `src/ui/query-gate.tsx` et son `.spec.tsx`, `src/ui/use-header-options.ts`
- Modifier : `src/ui/screen.tsx` (prop `underHeader`)
- Créer : `src/i18n/use-locale.ts`, `src/i18n/format-date.ts` et son `.spec.ts`
- Modifier : `src/i18n/use-t.ts`, qui passe par `useLocale`
- Créer : `src/features/orders/orders.query.ts`, `orders-screen.tsx` et son `.spec.tsx`
- Créer : `src/app/orders/index.tsx`
- Modifier : `src/features/session/home-screen.tsx` et son `.spec.tsx`
- Modifier : `packages/i18n/messages/vendor-mobile/fr.json` et `en.json`
- Modifier : `apps/vendor-mobile/codegen.ts`, et regénérer `src/graphql/generated/`
- Modifier : `docs/expo.md`

**Interfaces :**
- Consomme : `Query.orders` et `OrderSummary` (tâche 1).
- Produit : `type TQueryFailure = "signed-out" | "no-shop" | "unreachable"` ;
  `queryFailure(error: unknown): TQueryFailure` : `UNAUTHENTICATED` donne `signed-out`,
  `FORBIDDEN` donne `no-shop`, toute autre erreur `unreachable`.
- Produit : `QueryGate<TData>({ result, children }: QueryGateProps<TData>)`, où
  `result: { loading: boolean; error?: unknown; data?: TData; refetch: () => unknown }` et
  `children: (data: TData) => ReactNode`. Attente, retour à `/sign-in`, retour à `/`, ou écran
  « injoignable » avec « Réessayer » ; sinon `children(data)`.
- Produit : `useLocale(): TMobileLocale` ; `formatDate(iso: string, locale: TMobileLocale): string`,
  par `Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" })`.
- Produit : `useHeaderOptions(title: string)`, les options de `Stack.Screen` : en-tête visible,
  titre, couleurs du thème. `Screen` reçoit `underHeader?: boolean`, qui retire le bord du haut
  des marges de sécurité, déjà pris par l'en-tête.
- Produit : `ORDERS_QUERY`, `query Orders { orders { id reference customerName status
  paymentStatus total placedAt dispute } }`.
- Produit : `OrdersScreen()` ; toucher une ligne appelle
  `router.push({ pathname: "/orders/[id]", params: { id } })`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Le routeur d'Expo est simulé avec `replace`, `push` et `Stack.Screen` qui ne rend rien.

`query-failure.spec.ts` : un cas par code, `UNAUTHENTICATED`, `FORBIDDEN`, un autre code, une
erreur réseau. `me-state.spec.ts` reste tel quel et doit rester vert.

`format-date.spec.ts` : `"2026-11-10T09:00:00.000Z"` donne `"10 novembre 2026"` en français et
`"November 10, 2026"` en anglais.

`query-gate.spec.tsx` : l'attente affiche « Chargement… » ; `UNAUTHENTICATED` remplace par
`/sign-in` ; `FORBIDDEN` remplace par `/` ; une erreur réseau affiche « ClemPerl est
injoignable », et « Réessayer » appelle `refetch` ; des données rendent `children(data)`.

`orders-screen.spec.tsx`, `MockedProvider` :
- `it("affiche les commandes comme la liste web")` : la référence, le total, « Reçue · Paiement :
  En attente », puis le nom du client et « 10 novembre 2026 » ;
- `it("signale un litige à servir")` : `dispute: "TO_SERVE"` affiche « Litige tranché : client à
  servir » ;
- `it("dit qu'il n'y a pas encore de commande")` : une liste vide affiche « Vous n'avez pas
  encore de commande. » ;
- `it("ouvre la commande touchée")` : `push` reçoit `{ pathname: "/orders/[id]", params: { id:
  "o1" } }` ;
- `it("parle anglais sur un téléphone en anglais")` : « Received ».

`home-screen.spec.tsx` gagne : dans l'état `ready`, « Commandes » et « Produits » s'affichent,
et chacun pousse `/orders` ou `/products`.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/vendor-mobile test`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter, puis générer**

`codegen.ts` : `scalars: { DateTime: "string" }`, et `enumsAsTypes: true`, pour que
`OrderStatus` soit une union de chaînes et non un `enum` TypeScript ; vérifier dans le fichier
généré `export type OrderStatus = 'ACCEPTED' | …`. Une clé de catalogue se compose alors
``t(`orders.status.${order.status}`)``, vérifiée par le compilateur.

Les clés neuves, en français : `home.orders` « Commandes », `home.products` « Produits » ;
`orders.title` « Mes commandes », `orders.empty`, `orders.status.*` et `payment.status.*` repris
du web ; `orders.paymentLine` « Paiement : {status} » ; `orders.dispute.OPEN` « Litige ouvert, à
traiter sur le site » et `orders.dispute.TO_SERVE` repris du web. L'anglais en même temps :
« Orders », « My orders », « You don't have any orders yet. », Received, Accepted, Shipped,
Cancelled, Pending, Received, Declined, « Payment: {status} », « Dispute open, handle it on the
website », « Dispute decided: serve the customer ».

Les lignes s'affichent par `map` dans le défilement de `Screen`, pas par `FlatList` : une liste
virtualisée dans un `ScrollView` déclenche l'avertissement de React Native, et les listes d'une
boutique sont courtes (spec, section 5). Le commentaire le dit. `src/app/orders/index.tsx` pose
`<Stack.Screen options={useHeaderOptions(t("orders.title"))} />`, puis
`<Screen underHeader><OrdersScreen /></Screen>`.

- [ ] **Étape 4 : vérifier**

Run : `pnpm --filter @clemperl/vendor-mobile codegen && pnpm --filter @clemperl/vendor-mobile lint && pnpm --filter @clemperl/vendor-mobile typecheck && pnpm --filter @clemperl/vendor-mobile test`
Attendu : tout passe.

- [ ] **Étape 5 : le guide**

`docs/expo.md` gagne deux sections : l'en-tête natif d'un écran, réglé depuis l'écran par
`Stack.Screen`, et le retour qu'il donne, geste compris ; une liste courte rendue par `map`, et
le moment où `FlatList` devient nécessaire.

---

### Tâche 3 : le détail d'une commande dans l'API

**Fichiers :**
- Modifier : `apps/api/src/modules/orders/resolvers/orders.resolver.ts` et son `.spec.ts`
- Créer : `dto/response/order.dto.ts`, `order-line.dto.ts`, `shipping-address.dto.ts`
- Modifier : `dto/response/order-enums.dto.ts` (`PaymentMethod`, sur `E_PAYMENT_METHOD` ;
  `OrderAction`, sur `E_ORDER_ACTION` de `@clemperl/domain`), `schema.gql` (réimprimé)
- Modifier : `apps/api/test/vendor-reads.e2e-spec.ts`, `docs/graphql.md`

**Interfaces :**
- Consomme : `ShopGuard`, `IShopRequest`, `disputeNotice` (tâche 1).
- Produit, au schéma : `Order { id: ID!, reference: String!, status: OrderStatus!, placedAt:
  DateTime!, lines: [OrderLine!]!, total: String!, paymentMethod: PaymentMethod!, paymentStatus:
  PaymentStatus!, shipTo: ShippingAddress!, note: String, dispute: DisputeNotice, actions:
  [OrderAction!]! }` ; `OrderLine { id: ID!, title: String!, variantLabel: String!, quantity:
  Int!, total: String! }` ; `ShippingAddress { name, line, city, country, phone }`, tous
  `String!` ; `Query.order(id: ID!): Order`.
- Produit : `OrdersResolver.order(request: IShopRequest, id: string): Promise<OrderDto | null>`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`orders.resolver.spec.ts`, `readOrderForVendor` simulé :
- `it("rend null pour une commande introuvable ou d'une autre boutique")` : le dépôt rend `null`,
  la requête aussi, et le dépôt a reçu `({ marker: "prisma" }, { vendorId: "v1", orderId:
  "o9" })` ;
- `it("rend le détail champ par champ")` : les lignes portent `title` (`productTitle`),
  `variantLabel`, `quantity` et `total: formatPrice(unitAmount * quantity, currency)` ; `shipTo`
  reprend les cinq champs `shipTo*` ; `note: null` reste `null` ; les tentatives de paiement ne
  sortent pas ;
- `it("rend les actions que l'état permet")` : `PLACED` donne `allowedOrderActions("PLACED")`,
  `SHIPPED` donne `[]` ;
- le cas du schéma gagne : `order` est `Order`, sans `!`, et son argument `id` est `ID!`.

`vendor-reads.e2e-spec.ts` :
- `it("rend le détail d'une commande de la boutique")` : la référence, une ligne, `actions` égal à
  `["ACCEPT", "CANCEL"]` pour une commande reçue ;
- `it("rend null pour la commande d'une autre boutique")` et
  `it("rend null pour un identifiant inventé")` : `data.order` vaut `null` et `errors` est absent.

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/api test`
Attendu : échec sur les cas de `order`.

- [ ] **Étape 3 : implémenter**

`@Query(() => OrderDto, { name: "order", nullable: true })` et `@Args("id", { type: () => ID })`.
Le commentaire dit pourquoi `null` et non une erreur : la spec, section 4, en une phrase écrite
dans le commentaire même. `actions` vient d'`allowedOrderActions(order.status)`, comme les
boutons de la page web.

- [ ] **Étape 4 : réimprimer le schéma, puis vérifier**

Mêmes commandes qu'à la tâche 1, étape 4, sans la reconstruction du domaine.
Attendu : tout passe, couverture 100 %.

- [ ] **Étape 5 : le guide**

`docs/graphql.md` gagne une section : un argument (`id: ID!`) et une réponse qui peut manquer
(`Order` sans `!`), et pourquoi `null` vaut mieux qu'une erreur pour une commande d'une autre
boutique.

---

### Tâche 4 : le détail sur le téléphone

**Fichiers :**
- Créer : `apps/vendor-mobile/src/features/orders/order.query.ts`, `order-screen.tsx` et son
  `.spec.tsx`
- Créer : `src/app/orders/[id].tsx`
- Modifier : les deux catalogues, `docs/expo.md`

**Interfaces :**
- Consomme : `Query.order` (tâche 3), `QueryGate`, `useHeaderOptions`, `formatDate` (tâche 2).
- Produit : `ORDER_QUERY`, `query Order($id: ID!) { order(id: $id) { id reference status
  placedAt lines { id title variantLabel quantity total } total paymentMethod paymentStatus
  shipTo { name line city country phone } note dispute } }`. Sans `actions`, qui attend T8d.
- Produit : `OrderScreen({ id }: OrderScreenProps)`. La route lit l'identifiant par
  `useLocalSearchParams<{ id: string }>()`.

- [ ] **Étape 1 : écrire les tests qui échouent**

`order-screen.spec.tsx`, `MockedProvider`, variables `{ id: "o1" }` :
- `it("affiche la commande comme la page web")` : la référence, « Reçue », « Passée le 10 novembre
  2026 », la ligne « Sac cabas (Noir) x2 » et son total, « Total : … », « Paiement à la
  livraison » et « En attente », les lignes de l'adresse ;
- `it("montre le mot de l'acheteur s'il y en a un")`, et son absence quand `note` est `null` ;
- `it("signale un litige ouvert, à traiter sur le site")` ;
- `it("dit qu'une commande est introuvable")` : `order: null` affiche « Cette commande est
  introuvable. ».

- [ ] **Étape 2 : vérifier l'échec**

Run : `pnpm --filter @clemperl/vendor-mobile test`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : implémenter**

Les clés neuves : `orders.notFound`, `orders.placedOn` « Passée le {date} », `orders.lines`,
`orders.total` « Total : {amount} », `orders.shipTo`, `orders.note`, `payment.title` et
`payment.method.*` repris du web, avec leur anglais. Une ligne sans variante n'affiche pas de
parenthèses, comme sur le web.

- [ ] **Étape 4 : vérifier**

Même commande qu'à la tâche 2, étape 4.

- [ ] **Étape 5 : le guide**

`docs/expo.md` gagne une section : une route à paramètre, `orders/[id].tsx`, ouverte par
`router.push` et lue par `useLocalSearchParams`.

---

### Tâche 5 : la pièce du propriétaire, la liste des produits

Le constructeur écrit les tests et pose l'écran, voit les tests échouer, puis s'arrête et passe
la main avec la liste de l'étape 3. Le propriétaire écrit le reste. Le constructeur lance les
tests et relit avec lui. Si le propriétaire rend la pièce, le constructeur l'écrit.

**Fichiers du constructeur :**
- Créer : `apps/api/src/modules/products/resolvers/products.resolver.spec.ts`
- Modifier : `apps/api/test/vendor-reads.e2e-spec.ts` (`describe("products")`)
- Créer : `apps/vendor-mobile/src/features/products/products-screen.tsx` et son `.spec.tsx`,
  `product-row.spec.tsx`, `src/app/products.tsx`
- Modifier : les deux catalogues

**Fichiers du propriétaire :**
- Créer : `apps/api/src/modules/products/products.module.ts`, `resolvers/products.resolver.ts`,
  `resolvers/index.ts`, `dto/response/product-summary.dto.ts`, `dto/response/index.ts`
- Modifier : `apps/api/src/app.module.ts`, `schema.gql` (réimprimé)
- Créer : `apps/vendor-mobile/src/features/products/products.query.ts`, `product-row.tsx`

**Interfaces, que les tests fixent :**
- Au schéma : l'énumération `ProductStatus` (`DRAFT`, `PUBLISHED`), sur `E_PRODUCT_STATUS` ;
  `ProductSummary { id: ID!, title: String!, status: ProductStatus! }` ;
  `Query.products: [ProductSummary!]!`.
- `ProductsResolver.products(request: IShopRequest): Promise<ProductSummaryDto[]>`, derrière
  `SessionGuard` puis `ShopGuard`, qui appelle `listProductsForVendor(prisma, request.shop.id)`.
- `PRODUCTS_QUERY`, exporté de `products.query.ts` : `query Products { products { id title
  status } }`.
- `ProductRow({ title, status }: ProductRowProps)`, avec `ProductRowProps { title: string;
  status: ProductStatus }`, `ProductStatus` tiré des types générés.

- [ ] **Étape 1 : écrire les tests qui échouent (constructeur)**

`products.resolver.spec.ts` :
- `it("rend les produits de la boutique, champ par champ")` : une ligne du dépôt avec ses
  variantes, sa description et son slug donne exactement `{ id, title, status }`, et le dépôt a
  reçu `({ marker: "prisma" }, "v1")` ;
- `it("se publie dans le schéma sous les noms du contrat")` : `products` est
  `[ProductSummary!]!`, `ProductSummary.status` est `ProductStatus!`.

`vendor-reads.e2e-spec.ts`, `describe("products")` :
- `it("rend les produits de la boutique, brouillons compris, sans ceux d'une autre ni les
  supprimés")` : deux produits créés par `createProduct` sur A, dont un publié, un troisième
  marqué `deletedAt`, un sur B ; le membre de A lit les deux premiers, le plus récent en tête ;
- `it("refuse products à un compte sans boutique")` : `FORBIDDEN`.

`product-row.spec.tsx` : « Publié » pour `PUBLISHED`, « Brouillon » pour `DRAFT`, « Published »
sur un téléphone en anglais, et le titre chaque fois.

`products-screen.spec.tsx`, `MockedProvider` sur `PRODUCTS_QUERY` : une ligne par produit ; une
liste vide affiche « Vous n'avez pas encore de produit. Créez-les depuis le site ClemPerl. ».

Le constructeur pose `products-screen.tsx`, qui passe la réponse à `QueryGate` et rend un
`ProductRow` par produit, et la route `src/app/products.tsx`, au modèle des commandes. Il ajoute
`products.title`, `products.empty` et `products.status.*`, avec leur anglais.

- [ ] **Étape 2 : vérifier l'échec, puis passer la main (constructeur)**

Run : `pnpm --filter @clemperl/api test` et `pnpm --filter @clemperl/vendor-mobile test`
Attendu : échec, `ProductsResolver`, `PRODUCTS_QUERY` et `ProductRow` introuvables. Le
constructeur s'arrête ici.

- [ ] **Étape 3 : écrire la pièce (propriétaire)**

Dans cet ordre, chaque pas au modèle de son jumeau des commandes :
1. `product-summary.dto.ts`, avec `registerEnumType` pour `ProductStatus` ;
2. `products.resolver.ts` ; puis `products.module.ts`, et l'import dans `AppModule` ;
3. `docker exec clemperl_dev_api sh -c "cd apps/api && pnpm schema:print"`, et lire le
   `schema.gql` produit à côté de la classe ;
4. `products.query.ts`, puis `pnpm --filter @clemperl/vendor-mobile codegen` ;
5. `product-row.tsx`.

- [ ] **Étape 4 : vérifier et relire ensemble (constructeur)**

Run : les commandes des tâches 1 et 2, étape 4, sans la reconstruction du domaine.
Attendu : tout passe. Puis une relecture à deux de la pièce, consignée dans la passation.

---

### Tâche 6 : vérifier tout, la passation, la preuve, le commit

**Fichiers :**
- Modifier : `docs/passation.md`, `docs/pieges.md` s'il y a lieu

- [ ] **Étape 1 : vérifier tout**

Run : `pnpm turbo run lint typecheck test`, `pnpm verify:thresholds`, la couche e2e de l'API dans
le conteneur, puis `git diff | grep -nP "^\+.*[\x{2013}\x{2014}]"` et la même recherche sur
les fichiers neufs.
Attendu : tout passe, aucun tiret.

- [ ] **Étape 2 : la passation**

T8c, avec ce qu'elle livre, les décisions de ce plan telles que le propriétaire les a tranchées,
ce que la vérification a établi et n'a pas établi, la relecture de la pièce du propriétaire, et
comment reprendre.

- [ ] **Étape 3 : la preuve du propriétaire**

Sur son iPhone, dans Expo Go, Metro dans Docker : ouvrir « Commandes » et comparer la liste à
celle de l'espace vendeur web pour la même boutique ; ouvrir une commande et comparer le détail ;
ouvrir « Produits ». Passer le téléphone en anglais et relire les états. Puis, dans Apollo
Sandbox, connecté à la même boutique, demander `order` avec l'identifiant d'une commande d'une
autre boutique : `null`. Ce qu'il a vu entre dans la passation.

- [ ] **Étape 4 : le commit, avec son accord**

Le commit unique de la marche, avec ce plan et la passation, message en anglais sans signature
d'attribution ; puis, sur nouvel accord, le push et la pull request, corps de moins de 1500
caractères (`wc -m`).
