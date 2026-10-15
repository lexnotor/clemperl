import { describe, expect, it } from "vitest";
import { validateModerationDecision } from "./moderation-decision.utils.js";

describe("validateModerationDecision", () => {
    it("accepte un motif codé sans commentaire", () => {
        expect(() => validateModerationDecision({ reason: "COUNTERFEIT" })).not.toThrow();
    });

    // Même règle qu'un refus de candidature en T1b : « autre » ne dit rien au vendeur, donc
    // il faut écrire ce qu'on lui reproche.
    it("exige un commentaire quand le motif est « autre »", () => {
        expect(() => validateModerationDecision({ reason: "OTHER" })).toThrow();
        expect(() => validateModerationDecision({ reason: "OTHER", comment: "   " })).toThrow();
        expect(() =>
            validateModerationDecision({ reason: "OTHER", comment: "Photo d'une autre marque." }),
        ).not.toThrow();
    });

    // Le formulaire vient du navigateur : la valeur peut être n'importe quoi, y compris un
    // motif inventé ou un motif de candidature qui n'a rien à faire ici.
    it("refuse un motif qui n'est pas du vocabulaire", () => {
        for (const brut of ["", "INCOMPLETE_FILE", "counterfeit", "AUTRE", "<script>"]) {
            expect(() => validateModerationDecision({ reason: brut })).toThrow();
        }
    });
});
