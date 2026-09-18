import { describe, expect, it } from "vitest";
import { construireMessageReinitialisation } from "./messages-reinitialisation.utils.js";

describe("construireMessageReinitialisation", () => {
    it("place le lien dans le corps", () => {
        expect(
            construireMessageReinitialisation("https://x.test/abc", "fr").texte,
        ).toContain("https://x.test/abc");
    });

    it("dit explicitement quoi faire si la demande n'est pas de soi", () => {
        expect(construireMessageReinitialisation("https://x.test", "fr").texte).toContain(
            "ignorez",
        );
    });

    it("écrit en anglais pour la locale en", () => {
        expect(construireMessageReinitialisation("https://x.test", "en").sujet).toContain(
            "password",
        );
    });
});
