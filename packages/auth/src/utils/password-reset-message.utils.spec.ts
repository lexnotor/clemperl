import { describe, expect, it } from "vitest";
import { buildPasswordResetMessage } from "./password-reset-message.utils.js";

describe("buildPasswordResetMessage", () => {
    it("place le lien dans le corps", () => {
        expect(
            buildPasswordResetMessage("https://x.test/abc", "fr").text,
        ).toContain("https://x.test/abc");
    });

    it("dit explicitement quoi faire si la demande n'est pas de soi", () => {
        expect(buildPasswordResetMessage("https://x.test", "fr").text).toContain(
            "ignorez",
        );
    });

    it("écrit en anglais pour la locale en", () => {
        expect(buildPasswordResetMessage("https://x.test", "en").subject).toContain(
            "password",
        );
    });
});
