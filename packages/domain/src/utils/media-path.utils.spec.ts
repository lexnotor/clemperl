import { describe, expect, it } from "vitest";
import { derivativePath, isServableMediaPath, mediaPrefix } from "./media-path.utils.js";
import { buildOriginalPath } from "./media-path.server.utils.js";

const PRODUCT = "c1zqk8s0000008l3h2f4g5j6";
const DOSSIER = `${PRODUCT}/11111111-2222-3333-4444-555555555555`;

describe("buildOriginalPath", () => {
    it("range sous le produit, dans un dossier propre au dépôt", () => {
        const path = buildOriginalPath(PRODUCT, "Photo Été.JPG");
        expect(path).toMatch(new RegExp(`^${PRODUCT}/[0-9a-f-]{36}/original\\.jpg$`));
    });

    // Reprendre le nom du fichier laisserait choisir OÙ l'objet atterrit — `../` compris.
    it("ne reprend rien du nom fourni sauf l'extension", () => {
        const path = buildOriginalPath(PRODUCT, "../../secret.png");
        expect(path).not.toContain("..");
        expect(path).toMatch(/original\.png$/);
    });

    it("nettoie une extension exotique plutôt que de la reprendre telle quelle", () => {
        expect(buildOriginalPath(PRODUCT, "photo.jp g!")).toMatch(/original\.jpg$/);
    });

    it("retombe sur `bin` quand il n'y a pas d'extension", () => {
        expect(buildOriginalPath(PRODUCT, "photo")).toMatch(/original\.bin$/);
    });

    it("donne un dossier différent à chaque appel", () => {
        expect(buildOriginalPath(PRODUCT, "a.jpg")).not.toBe(buildOriginalPath(PRODUCT, "a.jpg"));
    });
});

describe("mediaPrefix", () => {
    it("rend le dossier, pour pouvoir tout supprimer d'un coup", () => {
        expect(mediaPrefix(`${DOSSIER}/original.jpg`)).toBe(DOSSIER);
    });
});

describe("derivativePath", () => {
    it("remplace le fichier sans toucher au dossier", () => {
        expect(derivativePath(`${DOSSIER}/original.jpg`, 800)).toBe(`${DOSSIER}/w800.webp`);
    });
});

describe("isServableMediaPath", () => {
    it("accepte chaque déclinaison produite", () => {
        for (const width of [320, 800, 1600]) {
            expect(isServableMediaPath(`${DOSSIER}/w${width}.webp`)).toBe(true);
        }
    });

    // L'original n'est JAMAIS servi par le relais. Il est conservé pour reproduire les
    // déclinaisons plus tard, ce qui se fait côté serveur par `readMedia` — sans passer
    // par cette route. L'autoriser rendait au navigateur un octet-pour-octet déposé par
    // le vendeur, avec le type qu'il avait lui-même déclaré : un SVG portant un `script`
    // revenait alors en `image/svg+xml` sur l'origine de la boutique, celle qui porte le
    // cookie de session partagé depuis T1a.
    it("refuse l'original, qui n'est jamais servi", () => {
        expect(isServableMediaPath(`${DOSSIER}/original.jpg`)).toBe(false);
        expect(isServableMediaPath(`${DOSSIER}/original.svg`)).toBe(false);
    });

    it("refuse une largeur qu'on ne produit pas", () => {
        expect(isServableMediaPath(`${DOSSIER}/w999.webp`)).toBe(false);
    });

    // Le motif est ANCRÉ aux deux bouts. Non ancré, il accepterait n'importe quel préfixe
    // et n'importe quel suffixe, et la barrière ne barrerait plus rien.
    it("refuse tout préfixe ajouté", () => {
        expect(isServableMediaPath(`../../${DOSSIER}/w320.webp`)).toBe(false);
        expect(isServableMediaPath(`vendor-documents/${DOSSIER}/w320.webp`)).toBe(false);
    });

    it("refuse tout suffixe ajouté", () => {
        expect(isServableMediaPath(`${DOSSIER}/w320.webp/../secret`)).toBe(false);
    });

    it("refuse un chemin de justificatif", () => {
        expect(isServableMediaPath("applications/abc/identity-1234.pdf")).toBe(false);
    });

    it("refuse une traversée déguisée", () => {
        expect(isServableMediaPath(`${DOSSIER}/..%2Foriginal.jpg`)).toBe(false);
    });

    it("refuse un dossier qui n'est pas un identifiant tiré au hasard", () => {
        expect(isServableMediaPath(`${PRODUCT}/court/w320.webp`)).toBe(false);
    });

    it("refuse un chemin vide", () => {
        expect(isServableMediaPath("")).toBe(false);
    });
});
