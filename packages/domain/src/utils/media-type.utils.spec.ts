import { describe, expect, it } from "vitest";
import { isAcceptedImageType } from "./media-type.utils.js";

describe("isAcceptedImageType", () => {
    it("accepte les formats matriciels que le catalogue sert", () => {
        for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
            expect(isAcceptedImageType(type)).toBe(true);
        }
    });

    // LE cas qui motive la liste blanche. `image/svg+xml` passe n'importe quel test de
    // la forme « ça commence par image/ », sharp le traite sans broncher, et un SVG est
    // un document qui exécute du script.
    it("refuse un SVG", () => {
        expect(isAcceptedImageType("image/svg+xml")).toBe(false);
    });

    it("refuse un format d'image que rien ne sert", () => {
        expect(isAcceptedImageType("image/tiff")).toBe(false);
        expect(isAcceptedImageType("image/heic")).toBe(false);
    });

    it("refuse ce qui n'est pas une image", () => {
        expect(isAcceptedImageType("text/html")).toBe(false);
        expect(isAcceptedImageType("application/pdf")).toBe(false);
        expect(isAcceptedImageType("")).toBe(false);
    });

    // Le navigateur écrit parfois la casse et les paramètres autrement. Les comparer
    // bruts refuserait une photo valable.
    it("ignore la casse et les paramètres", () => {
        expect(isAcceptedImageType("IMAGE/JPEG")).toBe(true);
        expect(isAcceptedImageType("image/png; charset=binary")).toBe(true);
        expect(isAcceptedImageType("  image/webp  ")).toBe(true);
    });

    // Le paramètre ne doit pas servir à faire passer autre chose.
    it("ne se laisse pas glisser un type derrière un paramètre", () => {
        expect(isAcceptedImageType("image/svg+xml; x=image/png")).toBe(false);
    });
});
