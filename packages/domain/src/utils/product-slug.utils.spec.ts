import { describe, expect, it } from "vitest";
import { isReservedProductSlug, slugifyProductTitle } from "./product-slug.utils.js";

describe("dérivation du slug de produit", () => {
    it("déplie les accents", () => {
        expect(slugifyProductTitle("Sac à main Été")).toBe("sac-a-main-ete");
    });

    it("réduit la ponctuation à des tirets", () => {
        expect(slugifyProductTitle("Cabas : cuir & lin")).toBe("cabas-cuir-lin");
    });

    it("ne laisse aucun tiret aux extrémités", () => {
        expect(slugifyProductTitle("  -- Cabas --  ")).toBe("cabas");
    });

    // `collections` est un segment de route sous une boutique. Next résout un segment
    // statique avant un segment dynamique, donc un produit portant ce slug deviendrait
    // inatteignable, sans message.
    it("signale un slug réservé", () => {
        expect(isReservedProductSlug(slugifyProductTitle("Collections"))).toBe(true);
        expect(isReservedProductSlug(slugifyProductTitle("Sac cabas"))).toBe(false);
    });
});
