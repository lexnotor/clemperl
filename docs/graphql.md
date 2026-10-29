# GraphQL dans ClemPerl

**Portée : `apps/api`, et l'application mobile qui l'appelle.** Les fronts web n'utilisent
pas GraphQL : ils lisent la base par leurs server actions.

Ce guide grandit avec T8. Chaque marche y ajoute les notions qu'elle fait entrer dans le
code, avec le fichier qui les montre. Il explique, il ne remplace pas la lecture du code.

---

## 1. Pourquoi GraphQL, et pourquoi seulement pour le téléphone

### Pourquoi

Le téléphone ne peut pas appeler les server actions de Next : elles n'existent que dans un
navigateur servi par Next. Il lui faut l'API. Et l'API aura plusieurs écrans très différents
à servir, la liste des commandes, le détail d'une commande, les produits, puis plus tard
l'application acheteur. Avec REST, il faudrait une route par écran, ou des routes qui
renvoient trop. Avec GraphQL, il y a **une seule route**, `/graphql`, et c'est le téléphone
qui dit quels champs il veut.

Le web, lui, ne change pas : la spec T8 l'a décidé, section 2. Les résolveurs GraphQL
appellent les mêmes fonctions de `packages/db` et `packages/domain` que les server actions,
donc la règle reste écrite une fois.

### Exemple

| Ce que le téléphone envoie | Ce que l'API rend |
| --- | --- |
| `{ me { user { email } } }` | `{ "data": { "me": { "user": { "email": "awa@atelier.test" } } } }` |
| `{ me { shop { name suspended } } }` | `{ "data": { "me": { "shop": { "name": "Atelier Awa", "suspended": false } } } }` |

La même requête `me`, deux formes de réponse : chacune ne porte que ce qui a été demandé.

### Trois choses à retenir

1. **Une seule adresse, `POST /graphql`.** Ce n'est pas l'URL qui choisit ce qu'on lit, c'est
   le texte de la requête.
2. **Le web n'y passe pas.** `/graphql` refuse les requêtes qui portent l'origine d'un front
   (voir la section 6) : ce n'est pas un oubli, c'est la décision de T8.
3. **La règle métier ne vit pas dans GraphQL.** Un résolveur est un transport, comme une
   server action : il appelle le domaine et les dépôts, il ne décide rien seul.

### Le piège

Croire qu'il faut recopier une règle du web dans l'API « parce que c'est GraphQL ». Si un
résolveur a besoin d'une règle que la server action porte elle-même, la règle sort dans une
fonction partagée, et les deux l'appellent.

---

## 2. Le schéma : le contrat entre l'API et le téléphone

### Pourquoi

Le téléphone et l'API sont deux programmes séparés. Il faut un document qui dit, sans
ambiguïté, ce que l'un peut demander à l'autre. C'est le **schéma**. Il liste les types, leurs
champs, et ce qui peut être absent.

Dans ClemPerl, on n'écrit pas ce schéma à la main. On écrit des **classes TypeScript**, et
NestJS en déduit le schéma. Puis on l'imprime dans un fichier versionné,
`apps/api/src/modules/graphql/schema.gql`, pour le lire comme un contrat.

### Exemple

La classe, dans `apps/api/src/modules/auth/dto/response/shop.dto.ts` :

```typescript
@ObjectType("Shop", { description: "La boutique dont le compte est membre." })
export class ShopDto {
    @Field(() => ID)
    id!: string;

    @Field({ description: "Le nom de la boutique, tel que les acheteurs le lisent." })
    name!: string;
    // ...
}
```

Ce qu'elle produit dans `schema.gql` :

```graphql
"""La boutique dont le compte est membre."""
type Shop {
  id: ID!

  """Le nom de la boutique, tel que les acheteurs le lisent."""
  name: String!
  # ...
}
```

### Trois choses à retenir

1. **`!` veut dire « jamais absent ».** `name: String!` est toujours là. Sans `!`, le champ
   peut valoir `null` : c'est le cas de `Me.shop`, parce qu'un compte peut ne pas avoir de
   boutique.
2. **La classe s'appelle `ShopDto`, le type s'appelle `Shop`.** Le nom de la classe suit la
   convention du dépôt (`docs/conventions/code.md`) ; le nom publié est celui passé à
   `@ObjectType`.
3. **Les descriptions sont en français**, parce qu'un humain les lit dans le terrain de jeu.
   Les noms de types et de champs sont en anglais, parce qu'une machine les lit.

### Le piège

`@Field(() => ID)` et `@Field()` ne sont pas interchangeables. Sans type explicite, NestJS lit
le type TypeScript (`string`) et publie `String`. Un identifiant doit être publié en `ID`,
donc il faut le dire.

---

## 3. Une requête, et son résolveur

### Pourquoi

Le schéma dit ce qu'on peut demander ; il faut ensuite du code qui réponde. Ce code
s'appelle un **résolveur**. Il est à GraphQL ce qu'un contrôleur est au REST : l'entrée du
module (`docs/conventions/nestjs.md`).

### Exemple

`apps/api/src/modules/auth/resolvers/me.resolver.ts`, simplifié :

```typescript
@Resolver(() => MeDto)
export class MeResolver {
    @Query(() => MeDto, { name: "me" })
    @UseGuards(SessionGuard)
    async me(@Context("req") request: ISessionRequest): Promise<MeDto> {
        const vendor = await readVendorForMember(prisma, request.session.user.id);
        // ...
    }
}
```

1. `@Query` déclare une requête nommée `me`, qui rend un `Me`.
2. `@UseGuards(SessionGuard)` exige une session, comme sur `GET /me`.
3. `readVendorForMember` est la fonction même que l'espace vendeur web appelle.

### Trois choses à retenir

1. **Un résolveur vit dans son module métier**, pas dans le module `graphql`. `MeResolver`
   est dans `auth`, à côté de `MeController`.
2. **Il rend un objet construit champ par champ**, jamais la session ou la ligne de base
   telles quelles : un champ ajouté plus tard à la base ne doit pas fuir vers le téléphone.
3. **Il est déclaré dans les `providers` de son module.** C'est ainsi que NestJS le trouve
   et l'ajoute au schéma.

### Le piège

Un résolveur oublié des `providers` ne provoque aucune erreur : sa requête n'existe
simplement pas dans le schéma. Le test du fichier de schéma (section 5) ne le voit PAS : le
code ne produit plus la requête, et `schema:print` la retire aussi du fichier, donc les deux
restent d'accord. Ce qui le voit, c'est le diff de `schema.gql`, où la requête disparaît, et
le test de bout en bout qui l'appelle, qui échoue sur `Cannot query field`. D'où une règle :
chaque requête a son test de bout en bout.

---

## 4. Le contexte, et la session

### Pourquoi

Un résolveur a besoin de savoir **qui** appelle. En REST, le contrôleur lit la requête HTTP.
En GraphQL, la requête HTTP est rangée dans le **contexte**, un objet que le pilote Apollo
passe à chaque résolveur. Le pilote y dépose la requête Express sous `req`.

### Exemple

1. Le téléphone envoie `POST /graphql` avec son cookie de session.
2. `SessionGuard` lit la requête dans le contexte GraphQL, demande la session à Better
   Auth, et l'attache à `req.session`.
3. Le résolveur la lit avec `@Context("req")`.

C'est le **même** garde que pour REST : `apps/api/src/modules/auth/guards/session.guard.ts`
regarde seulement si l'appel est HTTP ou GraphQL pour trouver la requête.

### Trois choses à retenir

1. **Un seul garde pour les deux transports**, pour que la règle de session reste écrite une
   fois.
2. **Le garde ne vérifie rien lui-même** : il demande à Better Auth, comme les fronts web.
3. **`@Context("req")` ne marche qu'après le garde** : avant lui, `req.session` n'existe pas.

### Le piège

Lire `context.switchToHttp()` dans un garde appelé par GraphQL : on obtient un objet qui n'est
pas la requête. Il faut passer par `GqlExecutionContext`, ce que fait `SessionGuard`.

---

## 5. Le fichier de schéma, et le test qui le garde

### Pourquoi

Le schéma vit en mémoire quand l'API tourne. Mais le téléphone, plus tard, en aura besoin
pour générer ses types, et toi pour lire le contrat. D'où une copie imprimée, versionnée, qui
ne doit jamais diverger du code.

### Exemple

```bash
# Réimprimer le fichier après un changement de type ou de résolveur, dans le conteneur :
docker exec clemperl_dev_api sh -c "cd apps/api && pnpm schema:print"
```

Le fichier apparaît côté machine, parce que `apps/api/src` est monté dans le conteneur. Le
test `apps/api/test/graphql-schema.e2e-spec.ts` compare ensuite le fichier au schéma de
l'application entière, à chaque passage de la CI.

### Trois choses à retenir

1. **On n'édite jamais `schema.gql` à la main.** On change une classe, puis on réimprime.
2. **Le fichier est trié.** Un diff n'y montre que ce qui a changé dans le contrat.
3. **Un changement de `schema.gql` est un changement de contrat** : il se relit comme tel
   dans une pull request.

### Le piège

Changer un type sans réimprimer : tout marche en local, et la CI échoue sur le test du
schéma, avec le nom du script dans le message.

---

## 6. Le terrain de jeu : Apollo Sandbox

### Pourquoi

Pour apprendre GraphQL, rien ne vaut taper une requête et lire la réponse. L'API ouvre donc,
en développement seulement, un **terrain de jeu** : Apollo Sandbox, servi à l'adresse de l'API
suivie de `/graphql`. On y explore le schéma avec ses descriptions, et on y compose une
requête en cochant les champs voulus, sans rien taper.

### Exemple

1. Se connecter sur la boutique web avec son compte vendeur.
2. Ouvrir l'adresse de l'API (`NEXT_PUBLIC_API_URL`) suivie de `/graphql`.
3. Dans l'explorateur, cocher `me`, puis `user` et `email`, puis `shop` et `name` : Sandbox
   écrit `{ me { user { email } shop { name } } }`. Exécuter.

La session ouverte sur la boutique vaut ici : en développement, la boutique et l'API vivent
sur le même hôte, à des ports différents, et un cookie n'est pas isolé par port.

### Trois choses à retenir

1. **L'interface vient d'Apollo, les requêtes viennent de notre API.** Sandbox s'affiche dans
   une iframe servie par Apollo, mais il confie chaque requête à la page qui l'héberge, servie
   par l'API. Elles portent donc l'origine de l'API, que `/graphql` admet hors production, et
   la session les accompagne, parce que `includeCookies` est allumé
   (`apps/api/src/modules/graphql/utils/graphql-playground.utils.ts`).
2. **Fermé en production**, avec l'introspection : un seul prédicat,
   `graphqlPlaygroundEnabled`, décide des deux. La télémétrie de Sandbox est coupée.
3. **`/graphql` filtre les origines.** Il accepte une requête sans origine, celle du
   téléphone, et, hors production, l'origine de l'API, celle du terrain de jeu. Tout le reste
   reçoit 403 : un site tiers, `null`, et les fronts web, sur `/graphql` comme sur ses
   sous-chemins.

### Le piège

Ouvrir le terrain de jeu sans être connecté sur la boutique : `me` rend une erreur
`UNAUTHENTICATED`. Ce n'est pas une panne, c'est le garde qui fait son travail. Et sans accès à
Internet, la page reste vide : l'interface de Sandbox se charge depuis le réseau d'Apollo.

---

## 7. Une erreur GraphQL

### Pourquoi

En REST, une session absente rend un statut 401. En GraphQL, la requête a bien été reçue et
exécutée, c'est un **champ** qui a échoué. La réponse arrive donc en 200, avec un tableau
`errors` à côté de `data`.

### Exemple

```json
{
  "errors": [{ "message": "Session absente ou expirée.", "extensions": { "code": "UNAUTHENTICATED" } }],
  "data": null
}
```

### Trois choses à retenir

1. **Le code est dans `extensions.code`.** C'est lui que le téléphone lit, jamais le message.
2. **`data` vaut `null`** parce que `me` est déclaré `Me!` : un champ jamais absent qui échoue
   emporte son parent.
3. **Le statut reste 200** : le pilote de NestJS le ramène à 200 dès que `data` existe, pour
   que tous les clients lisent la réponse de la même façon.

### Le piège

Tester une erreur GraphQL sur le statut HTTP. Il faut tester `errors[0].extensions.code`.
Les erreurs traduites pour le commerçant arrivent avec les écritures, en T8d, selon
`docs/conventions/erreurs.md`.

---

## 8. Le client : des requêtes typées par le schéma

### Pourquoi

Le téléphone envoie des requêtes GraphQL et lit leurs réponses. Écrites à la main, ces réponses
n'auraient aucun type : une faute de frappe sur un champ ne se verrait qu'à l'écran. Le client
s'appuie donc sur le fichier de schéma de l'API, `schema.gql`, pour **générer** le type de
chaque requête qu'il écrit.

### Exemple

1. `apps/vendor-mobile/src/features/session/me.query.ts` écrit la requête par `graphql(...)` :
   `query Me { me { user { email } shop { name suspended } } }`.
2. `pnpm --filter @clemperl/vendor-mobile codegen` lit `schema.gql` et cette requête, et écrit
   dans `src/graphql/generated/` le type `MeQuery`.
3. `useQuery(ME_QUERY)` rend alors `data` typé : `data.me.shop` est `{ name, suspended } | null`.

Le client lui-même est Apollo Client (`src/lib/apollo-client.ts`), qui envoie `POST /graphql`
avec le cookie de session en en-tête.

### Trois choses à retenir

1. **Le `lint` de l'application vérifie la génération** (`graphql-codegen --check`). Un champ
   renommé dans le schéma fait échouer la CI : `Cannot query field "suspended" on type "Shop"`.
2. **Seules les requêtes écrites ont des types.** Un type ajouté au schéma sans requête qui
   l'emploie ne change rien au code généré : c'est voulu.
3. **Les erreurs se lisent par leur code.** `meState`
   (`src/features/session/me-state.ts`) renvoie à la connexion sur `UNAUTHENTICATED`, et traite
   toute autre erreur comme une API injoignable, avec « Réessayer ».

### Le piège

Changer dans l'API un champ que l'application demande, réimprimer `schema.gql`, et oublier
l'application : son `lint` échoue, alors qu'on n'a rien touché de son côté. Relancer `codegen`,
puis adapter la requête si le champ a changé de nom.
