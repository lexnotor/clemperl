import { describe, expect, it } from "vitest";
import { ErreurDecisionInvalide } from "../errors/index.js";
import { validerDecision } from "./decision-vendeur.utils.js";

const BASE = { decideurId: "adm_1", candidatId: "usr_1" } as const;

function cleLevee(appel: () => void): string {
    try {
        appel();
    } catch (erreur) {
        return (erreur as ErreurDecisionInvalide).i18nKey;
    }
    return "";
}

describe("validité d'une décision", () => {
    it("accepte une acceptation sans motif", () => {
        expect(() => validerDecision({ ...BASE, decision: "ACCEPTED" })).not.toThrow();
    });

    it("refuse une acceptation porteuse d'un motif de refus", () => {
        expect(cleLevee(() => validerDecision({ ...BASE, decision: "ACCEPTED", raison: "OTHER" }))).toBe(
            "errors.vendor_application.reason_forbidden_on_accept",
        );
    });

    it("exige un motif codé sur un refus", () => {
        expect(cleLevee(() => validerDecision({ ...BASE, decision: "REJECTED" }))).toBe(
            "errors.vendor_application.reason_required",
        );
    });

    it("accepte un refus motivé", () => {
        expect(() =>
            validerDecision({ ...BASE, decision: "REJECTED", raison: "INCOMPLETE_FILE" }),
        ).not.toThrow();
    });

    it("exige un commentaire quand le motif est OTHER", () => {
        expect(cleLevee(() => validerDecision({ ...BASE, decision: "REJECTED", raison: "OTHER" }))).toBe(
            "errors.vendor_application.comment_required",
        );
        expect(() =>
            validerDecision({ ...BASE, decision: "REJECTED", raison: "OTHER", commentaire: "   " }),
        ).toThrow(ErreurDecisionInvalide);
        expect(() =>
            validerDecision({
                ...BASE,
                decision: "REJECTED",
                raison: "OTHER",
                commentaire: "Activité hors périmètre de la place de marché.",
            }),
        ).not.toThrow();
    });

    it("interdit de décider sur son propre dossier", () => {
        expect(
            cleLevee(() =>
                validerDecision({ decideurId: "usr_1", candidatId: "usr_1", decision: "ACCEPTED" }),
            ),
        ).toBe("errors.vendor_application.self_decision");
    });
});
