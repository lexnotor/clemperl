import { describe, expect, it } from "vitest";
import { buildObjectPath } from "./document-path.utils.js";

describe("chemin d'objet d'une pièce justificative", () => {
    it("range la pièce sous le groupe de sa soumission", () => {
        expect(buildObjectPath("soumission_1", "REGISTRY", "rccm.pdf")).toMatch(
            /^soumission_1\/REGISTRY-/,
        );
    });

    // Le nom fourni par l'utilisateur ne doit jamais servir de nom d'objet : il peut
    // contenir des séparateurs de chemin.
    it("n'utilise pas le nom d'origine, même piégé", () => {
        const path = buildObjectPath("soumission_1", "IDENTITY", "../../etc/passwd");
        expect(path).not.toContain("..");
        expect(path.split("/")).toHaveLength(2);
    });

    it("conserve l'extension d'origine, en minuscules", () => {
        expect(buildObjectPath("s_1", "TAX", "Scan.PDF")).toMatch(/\.pdf$/);
    });

    it("retombe sur .bin quand il n'y a pas d'extension", () => {
        expect(buildObjectPath("s_1", "TAX", "scan")).toMatch(/\.bin$/);
    });

    // Une resoumission qui réutiliserait le même chemin écraserait l'objet avant que la
    // transaction ne soit validée.
    it("produit deux chemins différents pour deux dépôts de la même pièce", () => {
        expect(buildObjectPath("s_1", "TAX", "scan.pdf")).not.toBe(
            buildObjectPath("s_1", "TAX", "scan.pdf"),
        );
    });
});
