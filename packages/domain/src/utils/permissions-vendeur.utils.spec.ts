import { describe, expect, it } from "vitest";
import {
    estMembreDe,
    peutDecider,
    peutResoumettre,
    peutVoirDossier,
} from "./permissions-vendeur.utils.js";

const CLIENT = { id: "usr_1", role: "CUSTOMER" } as const;
const AUTRE = { id: "usr_2", role: "CUSTOMER" } as const;
const ADMIN = { id: "adm_1", role: "ADMIN" } as const;

describe("permissions autour du dossier vendeur", () => {
    it("laisse le candidat voir son dossier et cache celui d'autrui", () => {
        expect(peutVoirDossier(CLIENT, { applicantId: "usr_1" })).toBe(true);
        expect(peutVoirDossier(AUTRE, { applicantId: "usr_1" })).toBe(false);
        expect(peutVoirDossier(ADMIN, { applicantId: "usr_1" })).toBe(true);
    });

    it("réserve la décision aux administrateurs", () => {
        expect(peutDecider(ADMIN)).toBe(true);
        expect(peutDecider(CLIENT)).toBe(false);
    });

    it("ne laisse resoumettre que le candidat, et que sur un dossier refusé", () => {
        const refuse = { applicantId: "usr_1", status: "REJECTED" } as const;
        expect(peutResoumettre(CLIENT, refuse)).toBe(true);
        expect(peutResoumettre(AUTRE, refuse)).toBe(false);
        expect(peutResoumettre(CLIENT, { applicantId: "usr_1", status: "SUBMITTED" })).toBe(false);
        expect(peutResoumettre(CLIENT, { applicantId: "usr_1", status: "ACCEPTED" })).toBe(false);
    });

    it("reconnaît un membre de boutique", () => {
        expect(estMembreDe([{ userId: "usr_1" }], "usr_1")).toBe(true);
        expect(estMembreDe([{ userId: "usr_1" }], "usr_9")).toBe(false);
    });
});
