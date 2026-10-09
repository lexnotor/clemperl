import { describe, expect, it } from "vitest";
import { checkoutSchema } from "./checkout.schema.js";

const valide = {
    name: "Awa Traoré",
    phone: "+32470000000",
    line: "12 rue des Tanneurs",
    city: "Bruxelles",
    country: "BE",
};

describe("checkoutSchema", () => {
    it("accepte une adresse ordinaire", () => {
        expect(checkoutSchema.safeParse(valide).success).toBe(true);
    });

    it("accepte un mot pour le vendeur", () => {
        expect(checkoutSchema.safeParse({ ...valide, note: "Emballage cadeau" }).success).toBe(
            true,
        );
    });

    it("refuse un champ d'adresse manquant", () => {
        for (const champ of ["name", "phone", "line", "city", "country"] as const) {
            // `delete` sur une copie, et non une destructuration qui écarte le champ :
            // celle-ci laisserait une variable que personne ne lit, et `eslint` la refuse.
            const sansLeChamp: Record<string, unknown> = { ...valide };
            delete sansLeChamp[champ];
            expect(checkoutSchema.safeParse(sansLeChamp).success).toBe(false);
        }
    });

    // Un pays sur deux lettres, comme `Vendor.country`. Une saisie libre rendrait le
    // regroupement par pays impossible le jour où la livraison arrivera.
    it("refuse un pays qui n'est pas un code à deux lettres", () => {
        expect(checkoutSchema.safeParse({ ...valide, country: "Belgique" }).success).toBe(false);
        expect(checkoutSchema.safeParse({ ...valide, country: "b" }).success).toBe(false);
        // Deux caractères, mais pas deux lettres : sans le motif, `.length(2)` l'accepte.
        expect(checkoutSchema.safeParse({ ...valide, country: "12" }).success).toBe(false);
    });

    // La même normalisation que la candidature vendeur, dont le test épingle déjà
    // « be » devenant « BE ».
    it("met le pays en majuscules", () => {
        const parse = checkoutSchema.safeParse({ ...valide, country: "be" });
        expect(parse.success && parse.data.country).toBe("BE");
    });

    it("refuse un mot démesuré", () => {
        expect(
            checkoutSchema.safeParse({ ...valide, note: "a".repeat(1001) }).success,
        ).toBe(false);
    });
});
