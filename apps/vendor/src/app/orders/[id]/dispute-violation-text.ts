import messages from "@clemperl/i18n/messages/vendor/fr.json";

const T = messages.disputes;
const VIOLATIONS: Record<string, string> = T.violations;

// Partagé par l'action et par le formulaire, qui contrôle les pièces avant l'envoi : les
// deux doivent dire la même phrase pour la même faute.
//
// Le domaine rend `errors.dispute.<clé>` ; seule la clé finale se cherche ici, par
// `Object.hasOwn` pour qu'une clé nommée `constructor` ne rende pas une fonction. Une clé
// absente retombe sur le message générique plutôt que sur une chaîne brute.
export function violationText(i18nKey: string, args: Record<string, unknown> | undefined): string {
    const key = i18nKey.replace(/^errors\.dispute\./, "");
    const text = Object.hasOwn(VIOLATIONS, key) ? (VIOLATIONS[key] as string) : T.failed;
    return text.replace("{maximum}", String(args?.["maximum"] ?? ""));
}
