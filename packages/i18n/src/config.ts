// Locales de la plateforme. Le français est la langue par défaut du marché visé ; il
// reste donc SANS préfixe d'URL sur la boutique (`/produits`), l'anglais étant préfixé
// (`/en/produits`). Un préfixe sur la langue majoritaire dilue le référencement sur
// deux URL pour un même contenu.
export const E_LOCALE = {
    FR: "fr",
    EN: "en",
} as const;

export type TLocale = (typeof E_LOCALE)[keyof typeof E_LOCALE];

export const DEFAULT_LOCALE: TLocale = E_LOCALE.FR;

export const LOCALES: readonly TLocale[] = [E_LOCALE.FR, E_LOCALE.EN];

export function isSupportedLocale(valeur: string): valeur is TLocale {
    return (LOCALES as readonly string[]).includes(valeur);
}

// Formats nommés, partagés par les fronts. next-intl les exige DÉCLARÉS : un nom
// inconnu lève `MISSING_FORMAT` au rendu, et la page qui l'emploie ne s'affiche pas.
// Les poser ici plutôt qu'au cas par cas garde une seule façon d'écrire une date.
export const FORMATS = {
    dateTime: {
        long: { dateStyle: "long" },
        complet: { dateStyle: "long", timeStyle: "short" },
    },
} as const;
