# Gestion des exceptions localisées

**Portée.** Le contrat `II18nExceptionResponse` vit dans `@clemperl/core` et vaut partout :
un produit, un seul format d'erreur. Le filtre d'exception global et les classes
d'exception par module sont propres à `apps/api` ; côté Next, ce sont les frontières
d'erreur et les retours de server actions qui appliquent le même contrat.

Toute erreur renvoyée au client est localisée et renvoyée sous forme de **tableau**
(`message: string[]`) — un seul format de sortie, qu'il y ait une ou dix erreurs.

## Le contrat

Les exceptions portent un payload structuré, pas une phrase :

```typescript
/** Structure d'une réponse d'exception localisée. */
export interface II18nExceptionResponse {
    /** La clé de traduction imbriquée (ex: "errors.order.not_found") */
    i18nKey: string;

    /** Les arguments dynamiques pour la traduction (ex: { id: "123" }) */
    i18nArgs?: Record<string, any>;

    /** Message de secours si la traduction n'est pas trouvée */
    fallbackMessage?: string;
}
```

Un filtre d'exception global traduit ce payload dans la locale de la requête, et traduit
aussi les exceptions standard du framework auxquelles on passe simplement une clé :
`new BadRequestException("errors.store.code_unavailable")`.

## Les quatre règles

1. **Clés imbriquées par domaine** dans le fichier de traductions :
   `errors.order.not_found`. Ne jamais utiliser une phrase entière comme clé JSON —
   une clé est un identifiant stable, une phrase change au premier ajustement de ton et
   casse toutes les langues d'un coup.
2. **Les classes d'exception vivent dans le module métier concerné**
   (`src/modules/order/exceptions/`), pas dans un module d'erreurs central. Le seul
   impératif est de respecter la structure ci-dessus.
3. **Jamais de phrase en dur dans un `throw`**, même « temporaire ». Un message non
   traduit atteint le client tel quel et ne se détecte qu'en production.
4. **Toute nouvelle clé est ajoutée dans TOUTES les langues dans le même changement.**
   Une clé absente d'une langue tombe sur le `fallbackMessage`, donc l'utilisateur reçoit
   une langue qui n'est pas la sienne, sans que rien ne le signale.
