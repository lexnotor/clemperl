import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./prisma-errors.js";

describe("isUniqueViolation", () => {
    // P2002 est le code que Prisma pose sur une violation de contrainte d'unicité. Le lire
    // permet de dire au vendeur de changer sa saisie plutôt que de lui montrer une panne.
    it("reconnaît une violation d'unicité", () => {
        expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    });

    it("refuse un autre code Prisma", () => {
        expect(isUniqueViolation({ code: "P2025" })).toBe(false);
        expect(isUniqueViolation({ code: "P1012" })).toBe(false);
    });

    it("refuse ce qui ne porte aucun code", () => {
        expect(isUniqueViolation(new Error("quelconque"))).toBe(false);
        expect(isUniqueViolation({})).toBe(false);
    });

    it("refuse ce qui n'est pas un objet", () => {
        expect(isUniqueViolation(null)).toBe(false);
        expect(isUniqueViolation(undefined)).toBe(false);
        expect(isUniqueViolation("P2002")).toBe(false);
    });
});
