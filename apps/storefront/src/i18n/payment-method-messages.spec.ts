import { E_PAYMENT_METHOD } from "@clemperl/db/enums";
import en from "@clemperl/i18n/messages/storefront/en.json";
import fr from "@clemperl/i18n/messages/storefront/fr.json";
import { describe, expect, it } from "vitest";

// La page de validation traduit chaque méthode par `t("method.<VALEUR>")`, et next-intl
// lève au RENDU sur une clé absente. Une valeur ajoutée à l'enum sans son libellé ferait
// tomber la page de validation de toute la place de marché, alors que le diff qui l'ajoute
// resterait vert partout ailleurs : les clés attendues se déduisent donc de l'enum, jamais
// d'une liste recopiée ici.
describe.each([
    ["fr", fr],
    ["en", en],
])("le catalogue %s", (_locale, catalogue) => {
    it.each(Object.values(E_PAYMENT_METHOD))("libelle la méthode %s", (method) => {
        const labels: Record<string, string> = catalogue.orders.method;

        expect(labels[method]).toBeTypeOf("string");
        expect(labels[method]).not.toBe("");
    });
});
