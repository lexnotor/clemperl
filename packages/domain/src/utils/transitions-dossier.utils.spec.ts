import { describe, expect, it } from "vitest";
import { E_ACTION_DOSSIER } from "../constants/index.js";
import { ErreurTransitionInterdite } from "../errors/index.js";
import { appliquerTransition, peutTransitionner } from "./transitions-dossier.utils.js";

describe("transitions du dossier vendeur", () => {
    it("accepte un dossier soumis", () => {
        expect(appliquerTransition("SUBMITTED", E_ACTION_DOSSIER.ACCEPTER)).toBe("ACCEPTED");
    });

    it("refuse un dossier soumis", () => {
        expect(appliquerTransition("SUBMITTED", E_ACTION_DOSSIER.REFUSER)).toBe("REJECTED");
    });

    it("laisse resoumettre un dossier refusé", () => {
        expect(appliquerTransition("REJECTED", E_ACTION_DOSSIER.RESOUMETTRE)).toBe("SUBMITTED");
    });

    it("n'autorise plus rien sur un dossier accepté", () => {
        expect(peutTransitionner("ACCEPTED", E_ACTION_DOSSIER.REFUSER)).toBe(false);
        expect(() => appliquerTransition("ACCEPTED", E_ACTION_DOSSIER.RESOUMETTRE)).toThrow(
            ErreurTransitionInterdite,
        );
    });

    it("n'autorise pas de resoumettre un dossier déjà soumis", () => {
        expect(peutTransitionner("SUBMITTED", E_ACTION_DOSSIER.RESOUMETTRE)).toBe(false);
    });

    it("n'autorise pas de décider deux fois", () => {
        expect(peutTransitionner("REJECTED", E_ACTION_DOSSIER.REFUSER)).toBe(false);
    });

    it("porte la clé de traduction et l'état refusé dans l'erreur", () => {
        try {
            appliquerTransition("ACCEPTED", E_ACTION_DOSSIER.REFUSER);
            expect.unreachable("la transition aurait dû être refusée");
        } catch (erreur) {
            expect(erreur).toBeInstanceOf(ErreurTransitionInterdite);
            const precise = erreur as ErreurTransitionInterdite;
            expect(precise.i18nKey).toBe("errors.vendor_application.forbidden_transition");
            expect(precise.i18nArgs).toEqual({ depuis: "ACCEPTED", action: "REFUSER" });
        }
    });
});
