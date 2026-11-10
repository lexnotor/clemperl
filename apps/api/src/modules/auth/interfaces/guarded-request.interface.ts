// La requête d'un garde, avant ou après qu'un autre l'a complétée. Partagée par les gardes de
// session et de boutique : chacun y attache ce qu'il a vérifié, et les types étroits
// (`ISessionRequest`, `IShopRequest`) disent ce que l'appelant peut lire une fois la chaîne passée.
export interface IGuardedRequest {
    headers: Record<string, string>;
    session?: unknown;
    shop?: unknown;
}
