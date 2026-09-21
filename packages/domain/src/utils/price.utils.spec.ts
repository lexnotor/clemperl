import { describe, expect, it } from "vitest";
import { formatPrice, parsePrice } from "./price.utils.js";

describe("parsePrice", () => {
    it("lit une virgule comme séparateur décimal", () => {
        expect(parsePrice("12,50", "EUR")).toBe(1250);
    });

    it("lit aussi un point", () => {
        expect(parsePrice("12.50", "EUR")).toBe(1250);
    });

    it("complète les décimales manquantes", () => {
        expect(parsePrice("12,5", "EUR")).toBe(1250);
        expect(parsePrice("12", "EUR")).toBe(1200);
    });

    // Le franc CFA n'a AUCUNE décimale. Multiplier par 100 y produirait un prix cent
    // fois trop grand, et tous les tests en euros passeraient quand même.
    it("n'ajoute aucune décimale à une devise d'exposant zéro", () => {
        expect(parsePrice("12000", "XOF")).toBe(12000);
        expect(parsePrice("12000", "XAF")).toBe(12000);
    });

    it("refuse une décimale dans une devise qui n'en a pas", () => {
        expect(() => parsePrice("12,50", "XOF")).toThrow(/décimale/i);
    });

    it("refuse plus de décimales que la devise n'en porte", () => {
        expect(() => parsePrice("12,505", "EUR")).toThrow(/décimale/i);
    });

    it("refuse un prix négatif", () => {
        expect(() => parsePrice("-1", "EUR")).toThrow();
    });

    it("refuse ce qui n'est pas un nombre", () => {
        expect(() => parsePrice("douze", "EUR")).toThrow();
        expect(() => parsePrice("", "EUR")).toThrow();
    });

    it("tolère les espaces autour et les séparateurs de milliers", () => {
        expect(parsePrice("  1 200,00 ", "EUR")).toBe(120000);
    });

    // La concaténation existe pour ce cas : `12.10 * 100` vaut 1209.9999999999998.
    it("ne perd rien sur un montant que la virgule flottante arrondirait mal", () => {
        expect(parsePrice("12,10", "EUR")).toBe(1210);
        expect(parsePrice("0,07", "EUR")).toBe(7);
    });
});

describe("formatPrice", () => {
    it("rend un montant en euros avec ses décimales", () => {
        expect(formatPrice(1250, "EUR", "fr-FR")).toContain("12,50");
    });

    it("rend un montant en francs CFA sans décimale", () => {
        const rendu = formatPrice(12000, "XOF", "fr-FR");
        expect(rendu).not.toContain(",00");
        expect(rendu).toContain("12");
    });
});
