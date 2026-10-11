import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import en from "@clemperl/i18n/messages/storefront/en.json";
import fr from "@clemperl/i18n/messages/storefront/fr.json";
import { describe, expect, it } from "vitest";

// La page de validation traduit chaque méthode par `t("method.<VALEUR>")`. Une clé absente
// ne fait pas tomber la page : next-intl journalise une erreur `MISSING_MESSAGE` et rend à
// la place du libellé le chemin de la clé, puisque `src/i18n/request.ts` ne redéfinit ni
// `onError` ni `getMessageFallback`. L'acheteur lit alors `orders.method.CARD` à l'endroit
// précis où il choisit comment payer, et rien d'autre dans la suite ne le verrait. Un
// libellé blanc laisse l'acheteur devant un choix sans nom, sans même une erreur au journal.
//
// Les clés attendues se déduisent de l'enum, jamais d'une liste recopiée ici : c'est
// l'ajout d'une valeur à l'enum que ce test doit voir.
describe.each([
    ["fr", fr],
    ["en", en],
])("le catalogue %s", (_locale, catalogue) => {
    it.each(Object.values(E_PAYMENT_METHOD))("libelle la méthode %s", (method) => {
        const labels: Record<string, string> = catalogue.orders.method;

        expect(labels[method]).toBeTypeOf("string");
        expect(labels[method]?.trim()).not.toBe("");
    });
});
