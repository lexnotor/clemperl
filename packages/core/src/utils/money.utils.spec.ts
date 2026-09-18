import { describe, expect, it } from "vitest";
import { E_CURRENCY } from "../enums/index.js";
import { addMoney, formatMoney } from "./money.utils.js";

describe("addMoney", () => {
    it("additionne deux montants de même devise", () => {
        const total = addMoney(
            { amount: 1999, currency: E_CURRENCY.EUR },
            { amount: 501, currency: E_CURRENCY.EUR },
        );
        expect(total).toEqual({ amount: 2500, currency: E_CURRENCY.EUR });
    });

    it("refuse d'additionner deux devises différentes", () => {
        expect(() =>
            addMoney(
                { amount: 1000, currency: E_CURRENCY.EUR },
                { amount: 1000, currency: E_CURRENCY.XOF },
            ),
        ).toThrow("devises différentes");
    });
});

describe("formatMoney", () => {
    it("place deux décimales pour l'euro", () => {
        const texte = formatMoney({ amount: 1999, currency: E_CURRENCY.EUR }, "fr-FR");
        expect(texte).toContain("19,99");
    });

    it("n'introduit AUCUNE décimale pour le franc CFA", () => {
        const texte = formatMoney({ amount: 1999, currency: E_CURRENCY.XOF }, "fr-FR");
        expect(texte).toContain("1");
        expect(texte).not.toContain("19,99");
        expect(texte).not.toContain("19.99");
    });
});
