import { describe, expect, it } from "vitest";
import { E_APPLICATION_ACTION } from "../constants/index.js";
import { ForbiddenTransitionError } from "../errors/index.js";
import { applyTransition, canTransition } from "./application-transitions.utils.js";

describe("transitions du dossier vendeur", () => {
    it("accepte un dossier soumis", () => {
        expect(applyTransition("SUBMITTED", E_APPLICATION_ACTION.APPROVE)).toBe("ACCEPTED");
    });

    it("refuse un dossier soumis", () => {
        expect(applyTransition("SUBMITTED", E_APPLICATION_ACTION.REJECT)).toBe("REJECTED");
    });

    it("laisse resoumettre un dossier refusé", () => {
        expect(applyTransition("REJECTED", E_APPLICATION_ACTION.RESUBMIT)).toBe("SUBMITTED");
    });

    it("n'autorise plus rien sur un dossier accepté", () => {
        expect(canTransition("ACCEPTED", E_APPLICATION_ACTION.REJECT)).toBe(false);
        expect(() => applyTransition("ACCEPTED", E_APPLICATION_ACTION.RESUBMIT)).toThrow(
            ForbiddenTransitionError,
        );
    });

    it("n'autorise pas de resoumettre un dossier déjà soumis", () => {
        expect(canTransition("SUBMITTED", E_APPLICATION_ACTION.RESUBMIT)).toBe(false);
    });

    it("n'autorise pas de décider deux fois", () => {
        expect(canTransition("REJECTED", E_APPLICATION_ACTION.REJECT)).toBe(false);
    });

    it("porte la clé de traduction et l'état refusé dans l'erreur", () => {
        try {
            applyTransition("ACCEPTED", E_APPLICATION_ACTION.REJECT);
            expect.unreachable("la transition aurait dû être refusée");
        } catch (error) {
            expect(error).toBeInstanceOf(ForbiddenTransitionError);
            const precise = error as ForbiddenTransitionError;
            expect(precise.i18nKey).toBe("errors.vendor_application.forbidden_transition");
            expect(precise.i18nArgs).toEqual({ from: "ACCEPTED", action: "REJECT" });
        }
    });
});
