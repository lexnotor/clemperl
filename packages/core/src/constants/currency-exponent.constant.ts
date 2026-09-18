import { E_CURRENCY, type TCurrency } from "../enums/index.js";

// Nombre de décimales de chaque devise. Le franc CFA n'en a AUCUNE : diviser un
// montant par 100 y produit un prix cent fois trop petit. Toute conversion passe
// par cette table, jamais par une constante écrite en dur.
export const CURRENCY_EXPONENT: Record<TCurrency, number> = {
    [E_CURRENCY.EUR]: 2,
    [E_CURRENCY.USD]: 2,
    [E_CURRENCY.XOF]: 0,
    [E_CURRENCY.XAF]: 0,
    [E_CURRENCY.CDF]: 2,
} as const;
