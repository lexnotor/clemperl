import { describe, expect, it } from "vitest";
import { DomainError } from "./domain.error.js";

describe("DomainError", () => {
    it("porte la clé, ses arguments et le message de secours", () => {
        const error = new DomainError({
            i18nKey: "errors.sample.key",
            i18nArgs: { name: "Clem" },
            fallbackMessage: "Message de secours.",
        });

        expect(error.i18nKey).toBe("errors.sample.key");
        expect(error.i18nArgs).toEqual({ name: "Clem" });
        expect(error.message).toBe("Message de secours.");
    });

    it("retombe sur la clé quand aucun message de secours n'est donné", () => {
        expect(new DomainError({ i18nKey: "errors.sample.bare" }).message).toBe(
            "errors.sample.bare",
        );
    });

    it("prend le nom de la sous-classe qui la lève", () => {
        class PreciseError extends DomainError {}
        expect(new PreciseError({ i18nKey: "k" }).name).toBe("PreciseError");
        expect(new PreciseError({ i18nKey: "k" })).toBeInstanceOf(DomainError);
    });
});
