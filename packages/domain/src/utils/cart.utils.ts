// Cent. Au-delà ce n'est plus un panier de détail, et la borne évite qu'un champ bricolé
// produise une commande de dix mille articles que personne n'honorera.
export const MAX_CART_QUANTITY = 100;

// PURE, donc éprouvable exhaustivement. Rien de ce qui vient d'un formulaire ou d'un
// panier local n'est digne de confiance, et zéro signifie « retire la ligne », ce qui est
// le comportement voulu pour une quantité qu'on ne sait pas lire.
//
// Cette fonction ne lève sur rien qui puisse l'atteindre, ce qui n'est pas la même chose
// que ne jamais lever : `Number` jette un `TypeError` sur un `Symbol` ou sur un objet dont
// `valueOf` jette. Ni `JSON.parse` ni un champ de formulaire ne produisent cela, donc on
// ne s'en protège pas, mais autant le dire que de promettre une totalité qui est fausse.
//
// `Number` et non `Number.parseInt` : ce dernier s'arrête au premier caractère qu'il ne
// sait pas lire, donc « 1e9 » lui vaut `1`, un nombre parfaitement plausible issu d'une
// entrée qui ne l'est pas. `Number` le lit comme un milliard, et c'est alors le PLAFOND
// qui protège, ce qui est son travail.
export function boundQuantity(raw: unknown): number {
    const parsed = Math.trunc(Number(raw));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    return Math.min(parsed, MAX_CART_QUANTITY);
}

// « Taille : L, Couleur : Noir ». Construit à la validation et FIGÉ sur la ligne de
// commande : relire les axes ferait dire à une commande ce que le catalogue dit
// aujourd'hui, pas ce qui a été acheté.
export function variantLabel(
    values: readonly { optionName: string; valueLabel: string }[],
): string {
    return values.map((v) => `${v.optionName} : ${v.valueLabel}`).join(", ");
}

// L'ordre d'APPARITION, et non l'ordre alphabétique : l'acheteur a construit son panier
// dans un ordre, et le regrouper ne doit pas le rebattre sous ses yeux.
export function groupByShop<T extends { shopSlug: string }>(
    lines: readonly T[],
): { shopSlug: string; lines: T[] }[] {
    const groups = new Map<string, T[]>();
    for (const line of lines) {
        const existing = groups.get(line.shopSlug);
        if (existing) {
            existing.push(line);
        } else {
            groups.set(line.shopSlug, [line]);
        }
    }
    return [...groups].map(([shopSlug, shopLines]) => ({ shopSlug, lines: shopLines }));
}

// En unité mineure ENTIÈRE, sans jamais diviser : une division introduirait un flottant,
// et un centime perdu dans un total est un centime que personne ne retrouve.
export function sumLines(
    lines: readonly { unitAmount: number; quantity: number }[],
): number {
    return lines.reduce((total, line) => total + line.unitAmount * line.quantity, 0);
}
