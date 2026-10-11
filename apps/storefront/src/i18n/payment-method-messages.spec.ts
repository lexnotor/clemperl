import { E_PAYMENT_METHOD, E_PAYMENT_STATUS } from "@clemperl/db/enums";
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

// La page d'une commande et la liste lisent `paymentStatus.<VALEUR>` pour l'état de l'argent
// et pour chaque tentative, et `methodHint.<VALEUR>` pour la phrase qui dit à l'acheteur ce
// qui lui reste à faire. Même mécanisme, même défaut : une clé absente rend son chemin à la
// place du libellé, et un libellé blanc laisse un état sans nom. Les clés se déduisent des
// enums, pour que l'ajout d'une valeur fasse échouer ce test.
describe.each([
    ["fr", fr],
    ["en", en],
])("le catalogue %s, côté paiement", (_locale, catalogue) => {
    it.each(Object.values(E_PAYMENT_STATUS))("libelle l'état %s", (status) => {
        const labels: Record<string, string> = catalogue.orders.paymentStatus;

        expect(labels[status]).toBeTypeOf("string");
        expect(labels[status]?.trim()).not.toBe("");
    });

    it.each(Object.values(E_PAYMENT_METHOD))("explique la méthode %s", (method) => {
        const hints: Record<string, string> = catalogue.orders.methodHint;

        expect(hints[method]).toBeTypeOf("string");
        expect(hints[method]?.trim()).not.toBe("");
    });

    // `/payments/start` rend ces CODES et jamais une phrase ; `UNAUTHORIZED` est celui que le
    // bouton forge pour une session absente, dont le message de l'API est une phrase. Ils
    // vivent dans l'API et ne s'importent pas ici : la liste est donc ÉCRITE, et c'est
    // voulu. Supprimer ou renommer une clé dans le catalogue fait échouer ce test, ce
    // qu'un simple « aucune phrase blanche » ne verrait pas si les deux langues dérivent
    // ensemble. Un code ajouté à l'API s'ajoute ici ET dans les catalogues.
    it("traduit exactement les codes de refus de /payments/start", () => {
        const errors: Record<string, string> = catalogue.orders.payErrors;

        expect(Object.keys(errors).sort()).toEqual(
            [
                "PAYMENT_ALREADY_SETTLED",
                "PAYMENT_NO_ADAPTER",
                "PAYMENT_ORDER_CANCELLED",
                "PAYMENT_ORDER_NOT_FOUND",
                "PAYMENT_ORIGIN_REFUSED",
                "UNAUTHORIZED",
            ].sort(),
        );
        for (const sentence of Object.values(errors)) {
            expect(sentence.trim()).not.toBe("");
        }
    });
});

// Une clé présente dans une langue et absente de l'autre ne casse rien au build : next-intl
// rend le chemin de la clé à l'exécution, sur la seule page qui l'emploie. La comparaison
// porte sur TOUT le catalogue, récursivement, et non sur un bloc : elle voit la clé qu'on
// ajoute demain sans qu'il faille penser à la lister ici.
function keyPaths(node: unknown, prefix = ""): string[] {
    if (typeof node !== "object" || node === null) {
        return [prefix];
    }
    return Object.entries(node).flatMap(([key, child]) =>
        keyPaths(child, prefix === "" ? key : `${prefix}.${key}`),
    );
}

describe("les catalogues du storefront", () => {
    it("portent les mêmes clés en français et en anglais", () => {
        expect(keyPaths(en).sort()).toEqual(keyPaths(fr).sort());
    });
});
