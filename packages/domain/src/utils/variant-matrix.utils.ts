export interface IOptionDraft {
    name: string;
    values: readonly string[];
}

export interface IExistingVariant {
    selections: Readonly<Record<string, string>>;
    priceAmount: number;
}

export interface IVariantDraft {
    selections: Readonly<Record<string, string>>;
    priceAmount: number;
    position: number;
}

// Le TRI est ce qui fait fonctionner l'unicité en base : sans lui,
// `{Taille:M, Couleur:Noir}` et `{Couleur:Noir, Taille:M}` produiraient deux clés
// différentes pour la même combinaison, et l'index ne verrait aucun doublon.
//
// Le séparateur est un caractère de contrôle, pas un tiret : un libellé a le droit de
// contenir « - » ou « = », et la clé ne doit pas devenir ambiguë pour autant.
export function selectionKey(selections: Readonly<Record<string, string>>): string {
    return Object.entries(selections)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, label]) => `${name}\u001e${label}`)
        .join("\u001f");
}

// Pure : ni base, ni réseau, ni horloge. C'est la fonction où une erreur coûterait le
// plus cher — un produit sans variante, ou des variantes en double — et c'est la seule
// de la tranche qui se teste exhaustivement sans rien monter.
//
// Elle est appelée des DEUX côtés : par le composant client pour afficher la grille, et
// par le dépôt pour l'écrire. La grille affichée est donc celle qui sera enregistrée,
// sans qu'aucune règle ne soit recopiée.
export function buildVariantMatrix(
    options: readonly IOptionDraft[],
    existing: readonly IExistingVariant[],
    fallbackPrice: number,
): IVariantDraft[] {
    const knownPrices = new Map(
        existing.map((variant) => [selectionKey(variant.selections), variant.priceAmount]),
    );

    // Le prix hérité n'est pas « le premier venu » : l'ordre que rend la base n'est pas
    // garanti, donc l'appelant passe une liste déjà ordonnée par `position` et on prend
    // sa tête. À défaut de toute variante, le prix que le formulaire a saisi.
    const inherited = existing[0]?.priceAmount ?? fallbackPrice;

    // Un axe sans valeur ne distingue rien : il ne multiplie pas la grille. Sans ce
    // filtre, un axe fraîchement ajouté et encore vide ramènerait la grille à zéro
    // ligne, et le vendeur perdrait ses prix à l'écran avant même d'avoir saisi.
    const usable = options.filter((option) => option.values.length > 0);

    const combinations = usable.reduce<Record<string, string>[]>(
        (accumulated, option) =>
            accumulated.flatMap((partial) =>
                option.values.map((label) => ({ ...partial, [option.name]: label })),
            ),
        [{}],
    );

    return combinations.map((selections, position) => ({
        selections,
        priceAmount: knownPrices.get(selectionKey(selections)) ?? inherited,
        position,
    }));
}
