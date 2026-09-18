import { DEFAULT_LOCALE, LOCALES } from "@clemperl/i18n";
import { defineRouting } from "next-intl/routing";

// `as-needed` laisse le français sans préfixe (`/produits`) et préfixe l'anglais
// (`/en/produits`). Préfixer la langue majoritaire du marché dilue le référencement
// sur deux URL pour un même contenu.
export const routing = defineRouting({
    locales: LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    localePrefix: "as-needed",
});
