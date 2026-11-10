import type { TMobileLocale } from "./locale";

// Une date ISO écrite dans la langue du téléphone. Afficher une date n'est pas une règle de
// ClemPerl : l'API envoie l'instant, l'application le met en forme.
export function formatDate(iso: string, locale: TMobileLocale): string {
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(iso));
}
