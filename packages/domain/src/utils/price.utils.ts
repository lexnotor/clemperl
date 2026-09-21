import { CURRENCY_EXPONENT, DomainError, type TCurrency } from "@clemperl/core";

export class InvalidPriceError extends DomainError {
    constructor(key: string, fallbackMessage: string) {
        super({ i18nKey: `errors.product.${key}`, fallbackMessage });
    }
}

// Une saisie francophone écrit « 1 200,50 ». `Number()` y rend `NaN` et `parseFloat` y
// rend `1`, tous deux sans rien signaler. La conversion est donc écrite et testée, et
// elle passe par l'exposant de la devise plutôt que par un `* 100` en dur : le franc
// CFA n'a AUCUNE décimale, et un centuplement y passerait inaperçu tant que les tests
// sont en euros.
export function parsePrice(input: string, currency: TCurrency): number {
    const cleaned = input
        .trim()
        .replace(/[\s\u00a0\u202f]/g, "")
        .replace(",", ".");

    if (!/^\d+(\.\d+)?$/.test(cleaned)) {
        throw new InvalidPriceError("price_not_a_number", `Prix illisible : « ${input} ».`);
    }

    const exponent = CURRENCY_EXPONENT[currency];
    const [whole = "0", decimals = ""] = cleaned.split(".");

    if (decimals.length > exponent) {
        throw new InvalidPriceError(
            "price_too_many_decimals",
            exponent === 0
                ? `Le ${currency} ne prend aucune décimale.`
                : `Le ${currency} ne prend que ${exponent} décimales.`,
        );
    }

    // L'entier se compose par CONCATÉNATION et non par multiplication : `12.10 * 100`
    // vaut 1209.9999999999998 en virgule flottante. Un `Math.round` rattraperait ce
    // cas-là, mais la classe de défaut resterait ouverte.
    return Number(whole + decimals.padEnd(exponent, "0"));
}

export function formatPrice(amount: number, currency: TCurrency, locale = "fr-FR"): string {
    const exponent = CURRENCY_EXPONENT[currency];
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: exponent,
        maximumFractionDigits: exponent,
    }).format(amount / 10 ** exponent);
}
