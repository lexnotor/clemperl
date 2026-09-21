import { describe, expect, it } from "vitest";
import { slugifyProductTitle } from "./product-slug.utils.js";

describe("dérivation du slug de produit", () => {
    it("déplie les accents", () => {
        expect(slugifyProductTitle("Sac à main Été")).toBe("sac-a-main-ete");
    });

    it("réduit la ponctuation à des tirets", () => {
        expect(slugifyProductTitle("Cabas — cuir & lin")).toBe("cabas-cuir-lin");
    });

    it("ne laisse aucun tiret aux extrémités", () => {
        expect(slugifyProductTitle("  -- Cabas --  ")).toBe("cabas");
    });
});
