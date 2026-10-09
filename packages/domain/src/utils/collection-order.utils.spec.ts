import { describe, expect, it } from "vitest";
import { moveItem } from "./collection-order.utils.js";

const ITEMS = [{ id: "a" }, { id: "b" }, { id: "c" }];
const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe("moveItem", () => {
    it("remonte un article d'un rang", () => {
        expect(ids(moveItem(ITEMS, "b", "up"))).toEqual(["b", "a", "c"]);
    });

    it("descend un article d'un rang", () => {
        expect(ids(moveItem(ITEMS, "b", "down"))).toEqual(["a", "c", "b"]);
    });

    // Le bouton reste cliquable en tête de liste : rendre la même liste vaut mieux que
    // lever, parce que l'appelant est une action serveur et qu'un clic sans effet n'est
    // pas une erreur à remonter.
    it("laisse la liste intacte aux extrémités", () => {
        expect(ids(moveItem(ITEMS, "a", "up"))).toEqual(["a", "b", "c"]);
        expect(ids(moveItem(ITEMS, "c", "down"))).toEqual(["a", "b", "c"]);
    });

    it("laisse la liste intacte pour un identifiant inconnu", () => {
        expect(ids(moveItem(ITEMS, "z", "up"))).toEqual(["a", "b", "c"]);
    });

    it("ne modifie pas la liste reçue", () => {
        const source = [...ITEMS];
        moveItem(source, "b", "up");
        expect(ids(source)).toEqual(["a", "b", "c"]);
    });
});
