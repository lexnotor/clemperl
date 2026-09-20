import { describe, expect, it } from "vitest";
import { slugifierNomBoutique } from "./slug-boutique.utils.js";

describe("dérivation du slug de boutique", () => {
    it("met en minuscules et relie par des tirets", () => {
        expect(slugifierNomBoutique("Chez Clem")).toBe("chez-clem");
    });

    it("déplie les accents au lieu de les encoder", () => {
        expect(slugifierNomBoutique("Créations Éclat")).toBe("creations-eclat");
    });

    it("écrase la ponctuation et les tirets répétés", () => {
        expect(slugifierNomBoutique("L'Atelier  —  Cuir & Co.")).toBe("l-atelier-cuir-co");
    });

    it("ne laisse jamais de tiret en bordure", () => {
        expect(slugifierNomBoutique("  -- Maroquinerie --  ")).toBe("maroquinerie");
    });

    it("tronque à 60 caractères sans finir sur un tiret", () => {
        const long = slugifierNomBoutique(`${"a".repeat(58)} bc`);
        expect(long.length).toBeLessThanOrEqual(60);
        expect(long.endsWith("-")).toBe(false);
    });
});
