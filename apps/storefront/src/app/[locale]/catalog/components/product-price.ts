import { formatPrice } from "@clemperl/domain";

interface IPricedRow {
    minPriceAmount: number;
    variantCount: number;
    currency: string;
}

// Le prix d'une carte, formaté CÔTÉ SERVEUR, et écrit en un seul endroit. La liste et la
// vitrine montrent les mêmes produits : la vitrine affichait le prix plancher comme s'il
// était le prix, donc un article à trois déclinaisons s'annonçait « 49,00 € » là et
// « à partir de 49,00 € » ici. Deux écrans du même dépôt, deux prix pour le même article,
// dont l'un faux pour deux déclinaisons sur trois.
//
// `formatPrice` tire `@clemperl/core`, donc nodemailer, donc `node:net` : ce module ne doit
// jamais être importé par un composant client.
export function displayPrice(
    row: IPricedRow,
    locale: string,
    t: (cle: string, valeurs?: Record<string, string>) => string,
): string {
    const prix = formatPrice(row.minPriceAmount, row.currency as never, locale);
    return row.variantCount > 1 ? t("fromPrice", { price: prix }) : prix;
}
