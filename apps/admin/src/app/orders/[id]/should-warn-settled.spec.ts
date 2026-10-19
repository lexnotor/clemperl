import { describe, expect, it } from "vitest";
import { shouldWarnSettled } from "./should-warn-settled";

describe("shouldWarnSettled", () => {
    it("avertit quand le paiement est reçu et l'annulation possible", () => {
        expect(shouldWarnSettled("SETTLED", ["ACCEPT", "CANCEL"])).toBe(true);
    });

    it("se tait quand le paiement est en attente", () => {
        expect(shouldWarnSettled("PENDING", ["ACCEPT", "CANCEL"])).toBe(false);
    });

    it("se tait quand aucune annulation n'est possible", () => {
        expect(shouldWarnSettled("SETTLED", [])).toBe(false);
    });
});
