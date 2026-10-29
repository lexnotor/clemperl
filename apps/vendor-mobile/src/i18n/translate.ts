import en from "@clemperl/i18n/messages/vendor-mobile/en.json";
import fr from "@clemperl/i18n/messages/vendor-mobile/fr.json";
import type { TMobileLocale } from "./locale";

// Les chemins pointés des phrases du catalogue français, `signIn.submit` par exemple. Le
// français fait foi : une clé qu'il n'a pas ne compile pas, et le test des catalogues garantit
// que l'anglais a les mêmes.
type TLeaves<T, P extends string = ""> = {
    [K in keyof T & string]: T[K] extends string ? `${P}${K}` : TLeaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TMessageKey = TLeaves<typeof fr>;

const CATALOGS: Record<TMobileLocale, unknown> = { fr, en };

// Pas de bibliothèque d'internationalisation : l'application a quelques dizaines de phrases,
// sans pluriel, et une recherche par chemin suffit. `{nom}` est remplacé par l'argument du même
// nom.
export function translate(
    locale: TMobileLocale,
    key: TMessageKey,
    args: Record<string, string> = {},
): string {
    const text = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], CATALOGS[locale]);
    return (text as string).replace(/\{(\w+)\}/g, (match, name: string) => args[name] ?? match);
}
