import { describe, expect, it } from "vitest";
import {
    RESET_PASSWORD_TOKEN_EXPIRES_IN,
    buildAdministratorInvitationMessage,
} from "./administrator-invitation-message.utils.js";

const LIEN = "https://clemperl.test/api/auth/reset-password/jeton";

describe("le courriel d'invitation", () => {
    it("porte le lien et ne conseille PAS de l'ignorer", () => {
        const message = buildAdministratorInvitationMessage(LIEN, "fr");
        expect(message.text).toContain(LIEN);
        // Le message de réinitialisation porte cette phrase. La partager ici dirait à un
        // collègue d'ignorer le seul lien qui lui ouvre son compte.
        expect(message.text).not.toContain("ignorez");
        expect(buildAdministratorInvitationMessage(LIEN, "en").text).not.toContain("ignore");
    });

    it("annonce la durée, et la durée annoncée est celle qui est configurée", () => {
        expect(buildAdministratorInvitationMessage(LIEN, "fr").text).toContain("trois jours");
        // Changer la constante sans changer la phrase ferait mentir le courriel. Cette
        // assertion est le seul endroit qui relie les deux.
        expect(RESET_PASSWORD_TOKEN_EXPIRES_IN).toBe(3 * 24 * 60 * 60);
    });

    it("parle anglais au besoin, et retombe sur le français", () => {
        expect(buildAdministratorInvitationMessage(LIEN, "en").text).toContain("three days");
        expect(buildAdministratorInvitationMessage(LIEN, "de").text).toContain("trois jours");
    });
});
