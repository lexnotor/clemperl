export type TMobileLocale = "fr" | "en";

// La langue de l'application suit celle du téléphone, et retombe sur le français, langue par
// défaut de ClemPerl. Écrite ici et non importée de `@clemperl/i18n` : l'application ne tire
// de ce paquet que ses catalogues JSON (spec T8, section 2).
export function deviceLocale(languageCode: string | null): TMobileLocale {
    return languageCode === "en" ? "en" : "fr";
}
