# Contexte de requête (AsyncLocalStorage)

**Portée : `apps/api`.** Les applications Next disposent déjà de `headers()`, `cookies()`
et du contexte de `next-intl` : elles n'ont pas besoin de cette mécanique.

## Le problème

Locale, identifiant de traçabilité, tenant courant, utilisateur : ces données sont
nécessaires très profond dans l'application (repositories, mappers, services de bas
niveau) alors qu'elles arrivent tout en haut, dans les en-têtes HTTP. Les faire
descendre en paramètre pollue toutes les signatures sur cinq niveaux.

## Le mécanisme

`AsyncLocalStorage` (Node natif) porte un store attaché à la chaîne asynchrone. Un
middleware l'ouvre une fois par requête et y enferme la suite du traitement : tout ce qui
s'exécute en dessous y accède, et deux requêtes concurrentes ont chacune le sien.

Trois pièces, et pas une de plus :

1. **Une interface** qui décrit le contexte (`IRequestContext` : requestId, locale,
   fallbackChain, ip, userAgent, tenant, user…).
2. **Un service `@Global()`** qui détient le store, avec `run(context, callback)` pour
   l'ouvrir et des accesseurs typés pour le lire (`getLocale()`, `getUser()`…).
3. **Un middleware appliqué à toutes les routes**, qui extrait les en-têtes, construit
   le contexte et appelle `service.run(context, next)`.

```typescript
use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
    const locale = this.extractLocale(req);

    const context: IRequestContext = { requestId, locale, /* … */ };

    // On renvoie l'identifiant au client pour corréler ses logs et les nôtres.
    res.setHeader("x-request-id", requestId);

    // Tout ce qui s'exécute dans next() voit ce contexte.
    this.requestContextService.run(context, next);
}
```

## Trois pièges, tous déjà payés

**L'utilisateur est `undefined` dans le middleware.** Les guards s'exécutent APRÈS les
middlewares, donc `req.user` n'existe pas encore au moment où le contexte est construit.
Le champ est prévu dans l'interface mais rempli plus tard, par le guard. Un service qui
lit l'utilisateur doit tolérer son absence sur les routes non authentifiées.

**Hors requête HTTP, il n'y a pas de contexte.** Un job de file d'attente, un script CLI
ou un seeder n'a traversé aucun middleware. D'où deux accesseurs plutôt qu'un :

- `get()` lève une erreur explicite, qui nomme la cause probable (« le middleware
  n'est pas appliqué, ou utilisez `runWithContext()` pour les jobs »). C'est le défaut :
  un contexte manquant là où il devrait être est un bug, pas une valeur à deviner.
- `getLocaleOrDefault()` retombe sur la valeur par défaut sans lever. Réservé aux
  cas où l'absence de contexte est légitime — initialiser une préférence persistée
  depuis un job ne doit pas échouer parce qu'il n'y a pas de requête.

Choisir consciemment lequel on appelle. Le piège est d'ajouter partout la variante
tolérante pour « ne plus avoir d'erreur » : on remplace alors un plantage bruyant par des
réponses dans la mauvaise langue, que personne ne remarque.

**Les tests unitaires n'ont pas de contexte non plus.** Prévoir dès le départ un helper
`runInTestContext({ locale, user }, fn)` dans les utilitaires de test. Sans lui, toute
classe qui lit le contexte devient intestable et finit mockée de travers.
