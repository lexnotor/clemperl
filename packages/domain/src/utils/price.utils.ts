import { CURRENCY_EXPONENT, DomainError, type TCurrency } from "@clemperl/core";

// `ProductVariant.priceAmount` est une colonne `Int` PostgreSQL. 2 147 483 647 vaut
// 2,1 milliards de francs CFA, environ 3,2 M€ — au-dessus de tout article des trois
// métiers visés. Le plafond est écrit ICI et pas seulement dans une spec, pour qu'il
// refuse au lieu de laisser Prisma échouer trois couches plus loin.
const MAX_PRICE_AMOUNT = 2_147_483_647;

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
    const amount = Number(whole + decimals.padEnd(exponent, "0"));

    // La borne est celle de la colonne PostgreSQL `Int`, où le montant sera rangé. Sans
    // ce refus, une saisie trop longue traverse toute la validation et n'échoue qu'à
    // l'écriture, sur un message générique qui ne dit pas que c'est le prix.
    if (!Number.isSafeInteger(amount) || amount > MAX_PRICE_AMOUNT) {
        throw new InvalidPriceError("price_out_of_range", `Prix hors des montants acceptés.`);
    }

    return amount;
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
