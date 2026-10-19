import { E_ORDER_STATUS } from "@clemperl/db/enums";

/** La première page, dès que ce qui arrive de l'URL n'est pas un numéro utilisable. */
export function pageFrom(raw: string | undefined): number {
    // Des chiffres et rien d'autre : `parseInt` lit « 2junk » comme 2.
    //
    // Aucun plafond, à la différence du catalogue, et c'est voulu : rabattre une page trop
    // haute ferait boucler le lien « suivant » sur la même page dès que la liste dépasse le
    // plafond. Une page au-delà des données rend une liste vide, rien de plus.
    if (raw === undefined || !/^\d+$/.test(raw)) {
        return 1;
    }
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/**
 * L'état demandé, ou rien s'il n'est pas du vocabulaire.
 *
 * Par `Object.hasOwn` et non par un accès direct : `E_ORDER_STATUS` est un objet, et un
 * état nommé `constructor` y rendrait une fonction là où l'on attend `undefined`. Le
 * piège est le même que celui que l'action vendeur paie sur les actions.
 */
export function statusFrom(raw: string | undefined): string | undefined {
    return raw !== undefined && Object.hasOwn(E_ORDER_STATUS, raw) ? raw : undefined;
}
