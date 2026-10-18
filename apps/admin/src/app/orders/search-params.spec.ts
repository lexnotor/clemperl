import { describe, expect, it } from "vitest";
import { pageFrom, statusFrom } from "./search-params.js";

describe("lire les paramètres d'URL de la liste des commandes", () => {
    // Un `skip` négatif fait LEVER Prisma, et une page non numérique rend `NaN`, que
    // `skip` propagerait jusqu'à la requête.
    it("ramène tout numéro de page impossible à la première", () => {
        for (const brut of [undefined, "", "0", "-3", "abc", "1e9999", "NaN", " "]) {
            expect(pageFrom(brut)).toBe(1);
        }
    });

    it("garde un numéro de page légitime", () => {
        expect(pageFrom("1")).toBe(1);
        expect(pageFrom("7")).toBe(7);
    });

    // Un état inventé ne doit pas atteindre le dépôt. Il est traité comme aucun filtre,
    // ce qui rend la liste complète : c'est la seule issue honnête, puisque l'écran ne
    // peut pas filtrer sur une valeur que l'énumération ne connaît pas.
    it("ignore un état hors vocabulaire, `constructor` compris", () => {
        for (const brut of [undefined, "", "BANANA", "constructor", "toString", "placed"]) {
            expect(statusFrom(brut)).toBeUndefined();
        }
    });

    it("garde les quatre états réels", () => {
        for (const etat of ["PLACED", "ACCEPTED", "SHIPPED", "CANCELLED"]) {
            expect(statusFrom(etat)).toBe(etat);
        }
    });
});
