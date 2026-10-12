import { describe, expect, it, vi } from "vitest";
import { ERROR_UNIQUE_RETRY_EXHAUSTED, retryOnUniqueViolation } from "./retry-unique.js";

/** Ce que Prisma lève sur une violation d'unicité, réduit à ce que le code lit. */
function violationUnicite(): Error & { code: string } {
    return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

describe("retryOnUniqueViolation", () => {
    it("rend le résultat sans rejouer quand la première tentative passe", async () => {
        const tentative = vi.fn().mockResolvedValue("fait");

        await expect(retryOnUniqueViolation(tentative)).resolves.toBe("fait");
        expect(tentative).toHaveBeenCalledTimes(1);
    });

    it("rejoue après une violation d'unicité, et rend le résultat de la reprise", async () => {
        const tentative = vi
            .fn()
            .mockRejectedValueOnce(violationUnicite())
            .mockResolvedValue("fait");

        await expect(retryOnUniqueViolation(tentative)).resolves.toBe("fait");
        expect(tentative).toHaveBeenCalledTimes(2);
    });

    // Ce qui compte n'est pas de rejouer une fois, c'est de rejouer tant qu'il reste des
    // essais : deux collisions de suite sont improbables mais pas impossibles, et abandonner
    // à la première reprise rendrait la garantie à moitié vraie.
    it("rejoue jusqu'à épuisement des essais", async () => {
        const tentative = vi
            .fn()
            .mockRejectedValueOnce(violationUnicite())
            .mockRejectedValueOnce(violationUnicite())
            .mockResolvedValue("fait");

        await expect(retryOnUniqueViolation(tentative, 4)).resolves.toBe("fait");
        expect(tentative).toHaveBeenCalledTimes(3);
    });

    // Une erreur qui n'est pas une collision ne se rejoue PAS : rejouer une panne la
    // multiplierait, et masquerait sa cause derrière un compteur d'essais.
    it("laisse remonter immédiatement ce qui n'est pas une violation d'unicité", async () => {
        const panne = new Error("la base ne répond pas");
        const tentative = vi.fn().mockRejectedValue(panne);

        await expect(retryOnUniqueViolation(tentative)).rejects.toBe(panne);
        expect(tentative).toHaveBeenCalledTimes(1);
    });

    // L'abandon est NOMMÉ. Laisser remonter le `P2002` brut ferait lire à l'appelant une
    // collision ordinaire, là où épuiser les essais dit autre chose : soit le hasard a été
    // extraordinaire, soit ce n'est pas la contrainte qu'on croit.
    it("abandonne après le dernier essai, en nommant l'épuisement", async () => {
        const tentative = vi.fn().mockRejectedValue(violationUnicite());

        await expect(retryOnUniqueViolation(tentative, 3)).rejects.toMatchObject({
            message: ERROR_UNIQUE_RETRY_EXHAUSTED,
        });
        expect(tentative).toHaveBeenCalledTimes(3);
    });
});
