import type { ISessionRequest } from "./session-request.interface";

// La requête telle que `ShopGuard` la laisse : la boutique du compte s'ajoute à la session, et
// ne se lit qu'après les deux gardes, dans cet ordre.
export interface IShopRequest extends ISessionRequest {
    shop: { id: string };
}
