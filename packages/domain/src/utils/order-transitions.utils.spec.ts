import { describe, expect, it } from "vitest";
import { E_ORDER_ACTION } from "../constants/order-transitions.constant.js";
import {
    advanceOrder,
    allowedOrderActions,
    canAdvanceOrder,
} from "./order-transitions.utils.js";

describe("les transitions d'une commande", () => {
    it("accepte ou annule une commande qui vient d'être passée", () => {
        expect(advanceOrder("PLACED", E_ORDER_ACTION.ACCEPT)).toBe("ACCEPTED");
        expect(advanceOrder("PLACED", E_ORDER_ACTION.CANCEL)).toBe("CANCELLED");
    });

    it("expédie ou annule une commande acceptée", () => {
        expect(advanceOrder("ACCEPTED", E_ORDER_ACTION.SHIP)).toBe("SHIPPED");
        expect(advanceOrder("ACCEPTED", E_ORDER_ACTION.CANCEL)).toBe("CANCELLED");
    });

    // On n'expédie pas ce qui n'a pas été accepté : l'ordre des étapes est la règle, et
    // c'est la table qui la porte, pas une cascade de conditions dans un écran.
    it("refuse d'expédier une commande qui vient d'être passée", () => {
        expect(canAdvanceOrder("PLACED", E_ORDER_ACTION.SHIP)).toBe(false);
        expect(() => advanceOrder("PLACED", E_ORDER_ACTION.SHIP)).toThrow();
    });

    it("refuse toute action depuis un état terminal", () => {
        for (const terminal of ["SHIPPED", "CANCELLED"] as const) {
            for (const action of Object.values(E_ORDER_ACTION)) {
                expect(canAdvanceOrder(terminal, action)).toBe(false);
                expect(() => advanceOrder(terminal, action)).toThrow();
            }
            expect(allowedOrderActions(terminal)).toEqual([]);
        }
    });

    // L'écran n'affiche QUE les boutons que cette liste rend : une action impossible ne
    // se grise pas, elle ne s'affiche pas.
    it("rend les actions permises depuis chaque état", () => {
        expect(allowedOrderActions("PLACED").sort()).toEqual(["ACCEPT", "CANCEL"]);
        expect(allowedOrderActions("ACCEPTED").sort()).toEqual(["CANCEL", "SHIP"]);
    });
});
