import { describe, expect, it } from "vitest";
import { InvalidDecisionError } from "../errors/index.js";
import { validateDecision } from "./vendor-decision.utils.js";

const BASE = { deciderId: "adm_1", applicantId: "usr_1" } as const;

function keyThrownBy(call: () => void): string {
    try {
        call();
    } catch (error) {
        return (error as InvalidDecisionError).i18nKey;
    }
    return "";
}

describe("validité d'une décision", () => {
    it("accepte une acceptation sans motif", () => {
        expect(() => validateDecision({ ...BASE, outcome: "ACCEPTED" })).not.toThrow();
    });

    it("refuse une acceptation porteuse d'un motif de refus", () => {
        expect(
            keyThrownBy(() => validateDecision({ ...BASE, outcome: "ACCEPTED", reason: "OTHER" })),
        ).toBe("errors.vendor_application.reason_forbidden_on_accept");
    });

    it("exige un motif codé sur un refus", () => {
        expect(keyThrownBy(() => validateDecision({ ...BASE, outcome: "REJECTED" }))).toBe(
            "errors.vendor_application.reason_required",
        );
    });

    it("accepte un refus motivé", () => {
        expect(() =>
            validateDecision({ ...BASE, outcome: "REJECTED", reason: "INCOMPLETE_FILE" }),
        ).not.toThrow();
    });

    it("exige un commentaire quand le motif est OTHER", () => {
        expect(
            keyThrownBy(() => validateDecision({ ...BASE, outcome: "REJECTED", reason: "OTHER" })),
        ).toBe("errors.vendor_application.comment_required");
        expect(() =>
            validateDecision({ ...BASE, outcome: "REJECTED", reason: "OTHER", comment: "   " }),
        ).toThrow(InvalidDecisionError);
        expect(() =>
            validateDecision({
                ...BASE,
                outcome: "REJECTED",
                reason: "OTHER",
                comment: "Activité hors périmètre de la place de marché.",
            }),
        ).not.toThrow();
    });

    it("interdit de décider sur son propre dossier", () => {
        expect(
            keyThrownBy(() =>
                validateDecision({ deciderId: "usr_1", applicantId: "usr_1", outcome: "ACCEPTED" }),
            ),
        ).toBe("errors.vendor_application.self_decision");
    });
});
