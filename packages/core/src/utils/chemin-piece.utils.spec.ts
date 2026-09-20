import { describe, expect, it } from "vitest";
import { construireCheminObjet } from "./chemin-piece.utils.js";

describe("chemin d'objet d'une pièce justificative", () => {
    it("range la pièce sous le groupe de sa soumission", () => {
        expect(construireCheminObjet("soumission_1", "REGISTRY", "rccm.pdf")).toMatch(
            /^soumission_1\/REGISTRY-/,
        );
    });

    // Le nom fourni par l'utilisateur ne doit jamais servir de nom d'objet : il peut
    // contenir des séparateurs de chemin.
    it("n'utilise pas le nom d'origine, même piégé", () => {
        const chemin = construireCheminObjet("soumission_1", "IDENTITY", "../../etc/passwd");
        expect(chemin).not.toContain("..");
        expect(chemin.split("/")).toHaveLength(2);
    });

    it("conserve l'extension d'origine, en minuscules", () => {
        expect(construireCheminObjet("s_1", "TAX", "Scan.PDF")).toMatch(/\.pdf$/);
    });

    it("retombe sur .bin quand il n'y a pas d'extension", () => {
        expect(construireCheminObjet("s_1", "TAX", "scan")).toMatch(/\.bin$/);
    });

    // Une resoumission qui réutiliserait le même chemin écraserait l'objet avant que la
    // transaction ne soit validée.
    it("produit deux chemins différents pour deux dépôts de la même pièce", () => {
        expect(construireCheminObjet("s_1", "TAX", "scan.pdf")).not.toBe(
            construireCheminObjet("s_1", "TAX", "scan.pdf"),
        );
    });
});
