import { describe, expect, it } from "vitest";
import { canDecide, canResubmit, canViewApplication, isMemberOf } from "./vendor-permissions.utils.js";

const CUSTOMER = { id: "usr_1", role: "CUSTOMER" } as const;
const OTHER = { id: "usr_2", role: "CUSTOMER" } as const;
const ADMIN = { id: "adm_1", role: "ADMIN" } as const;

describe("permissions autour du dossier vendeur", () => {
    it("laisse le candidat voir son dossier et cache celui d'autrui", () => {
        expect(canViewApplication(CUSTOMER, { applicantId: "usr_1" })).toBe(true);
        expect(canViewApplication(OTHER, { applicantId: "usr_1" })).toBe(false);
        expect(canViewApplication(ADMIN, { applicantId: "usr_1" })).toBe(true);
    });

    it("réserve la décision aux administrateurs", () => {
        expect(canDecide(ADMIN)).toBe(true);
        expect(canDecide(CUSTOMER)).toBe(false);
    });

    it("ne laisse resoumettre que le candidat, et que sur un dossier refusé", () => {
        const rejected = { applicantId: "usr_1", status: "REJECTED" } as const;
        expect(canResubmit(CUSTOMER, rejected)).toBe(true);
        expect(canResubmit(OTHER, rejected)).toBe(false);
        expect(canResubmit(CUSTOMER, { applicantId: "usr_1", status: "SUBMITTED" })).toBe(false);
        expect(canResubmit(CUSTOMER, { applicantId: "usr_1", status: "ACCEPTED" })).toBe(false);
    });

    it("reconnaît un membre de boutique", () => {
        expect(isMemberOf([{ userId: "usr_1" }], "usr_1")).toBe(true);
        expect(isMemberOf([{ userId: "usr_1" }], "usr_9")).toBe(false);
    });
});
