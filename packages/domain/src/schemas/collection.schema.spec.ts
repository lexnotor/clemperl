import { describe, expect, it } from "vitest";
import { collectionDetailsSchema, slugifyCollectionTitle } from "./collection.schema.js";

describe("collectionDetailsSchema", () => {
    it("accepte un titre et une description", () => {
        const parsed = collectionDetailsSchema.parse({
            title: "Soldes d'été",
            description: "Les pièces de la saison, à prix réduit.",
        });
        expect(parsed.title).toBe("Soldes d'été");
    });

    it("accepte une collection sans description", () => {
        expect(collectionDetailsSchema.parse({ title: "Soldes d'été" }).description).toBeUndefined();
    });

    // Sans deux caractères latins, le slug est vide et la deuxième collection du genre
    // casse sur l'unicité.
    it("refuse un titre dont aucun slug ne peut sortir", () => {
        expect(collectionDetailsSchema.safeParse({ title: "日本橋" }).success).toBe(false);
        expect(collectionDetailsSchema.safeParse({ title: "!!!" }).success).toBe(false);
    });

    it("coupe les espaces autour du titre", () => {
        expect(collectionDetailsSchema.parse({ title: "  Soldes  " }).title).toBe("Soldes");
    });
});

describe("slugifyCollectionTitle", () => {
    it("déplie les accents et réduit la ponctuation", () => {
        expect(slugifyCollectionTitle("Soldes d'été : -30 %")).toBe("soldes-d-ete-30");
    });
});
