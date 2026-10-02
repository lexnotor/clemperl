import { listCatalogCurrencies, prisma } from "@clemperl/db";
import { chooseCatalogCurrency } from "@clemperl/domain";
import { cookies } from "next/headers";

// Non `httpOnly` : c'est un composant client qui l'écrit, et il ne porte rien de sensible.
export const CURRENCY_COOKIE = "currency";

// La devise borne la LISTE, et seulement elle. La décision elle-même est pure et vit dans
// le domaine, avec ses tests ; ici on ne fait que lire le cookie et la base.
export async function readCurrencyCookie(): Promise<{
    current: string;
    available: { currency: string; productCount: number }[];
}> {
    const available = await listCatalogCurrencies(prisma);
    const demandee = (await cookies()).get(CURRENCY_COOKIE)?.value;

    return {
        current: chooseCatalogCurrency(
            demandee,
            available.map((entree) => entree.currency),
        ),
        available,
    };
}
