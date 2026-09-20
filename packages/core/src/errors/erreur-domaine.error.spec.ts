import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "./erreur-domaine.error.js";

describe("ErreurDomaine", () => {
    it("porte la clé, ses arguments et le message de secours", () => {
        const erreur = new ErreurDomaine({
            i18nKey: "errors.essai.cle",
            i18nArgs: { nom: "Clem" },
            fallbackMessage: "Message de secours.",
        });

        expect(erreur.i18nKey).toBe("errors.essai.cle");
        expect(erreur.i18nArgs).toEqual({ nom: "Clem" });
        expect(erreur.message).toBe("Message de secours.");
    });

    it("retombe sur la clé quand aucun message de secours n'est donné", () => {
        expect(new ErreurDomaine({ i18nKey: "errors.essai.nue" }).message).toBe(
            "errors.essai.nue",
        );
    });

    it("prend le nom de la sous-classe qui la lève", () => {
        class ErreurPrecise extends ErreurDomaine {}
        expect(new ErreurPrecise({ i18nKey: "k" }).name).toBe("ErreurPrecise");
        expect(new ErreurPrecise({ i18nKey: "k" })).toBeInstanceOf(ErreurDomaine);
    });
});
