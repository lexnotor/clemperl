import { CURRENCY_EXPONENT } from "../constants/index.js";
import type { IMoney } from "../interfaces/index.js";

// Additionne deux montants. Lève si les devises diffèrent : additionner des euros
// et des francs CFA n'a pas de sens, et le silence produirait un total faux
// qu'aucun type ne signalerait.
export function addMoney(a: IMoney, b: IMoney): IMoney {
    if (a.currency !== b.currency) {
        throw new Error(
            `Addition impossible entre devises différentes : ${a.currency} et ${b.currency}`,
        );
    }
    return { amount: a.amount + b.amount, currency: a.currency };
}

// Formate un montant pour l'affichage. L'exposant vient de la table des devises :
// le XOF en a zéro, donc son montant s'affiche tel quel.
export function formatMoney(money: IMoney, locale: string): string {
    const exposant = CURRENCY_EXPONENT[money.currency];
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: money.currency,
        minimumFractionDigits: exposant,
        maximumFractionDigits: exposant,
    }).format(money.amount / 10 ** exposant);
}
