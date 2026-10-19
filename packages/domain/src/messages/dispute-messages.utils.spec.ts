import { describe, expect, it } from "vitest";
import { buildDisputeDecisionMessage, buildDisputeOpenedMessage } from "./dispute-messages.utils.js";

const REFERENCE = "CMD-2026-ABC123";
const LINK = "http://localhost:3001/orders/o1";

describe("le courriel d'ouverture, au vendeur", () => {
    it("nomme la commande, le motif et le lien pour répondre", () => {
        const message = buildDisputeOpenedMessage(
            { reference: REFERENCE, reason: "DAMAGED", link: LINK },
            "fr",
        );
        expect(message.recipient).toBe("");
        expect(message.subject).toContain(REFERENCE);
        expect(message.text).toContain(LINK);
        expect(message.text).toContain("abîmé");
    });

    // Le motif est traduit ICI, dans la langue du vendeur : le prendre ailleurs ferait
    // partir un message anglais portant un motif français.
    it("parle anglais, motif compris, à un vendeur anglophone", () => {
        const message = buildDisputeOpenedMessage(
            { reference: REFERENCE, reason: "WRONG_ITEM", link: LINK },
            "en",
        );
        expect(message.subject).toContain(REFERENCE);
        expect(message.text.toLowerCase()).toContain("wrong item");
        expect(message.subject).not.toBe(
            buildDisputeOpenedMessage({ reference: REFERENCE, reason: "WRONG_ITEM", link: LINK }, "fr")
                .subject,
        );
    });

    it("retombe sur le français pour une langue inconnue", () => {
        const args = { reference: REFERENCE, reason: "NOT_RECEIVED", link: LINK };
        expect(buildDisputeOpenedMessage(args, "de")).toEqual(buildDisputeOpenedMessage(args, "fr"));
    });

    // Le dépôt refuse un motif hors vocabulaire en amont, mais ce constructeur est pur et ne
    // compte pas sur son appelant : un message vide serait pire qu'un code brut.
    it("affiche le code brut d'un motif inconnu", () => {
        const message = buildDisputeOpenedMessage(
            { reference: REFERENCE, reason: "LOST_IN_TRANSIT", link: LINK },
            "fr",
        );
        expect(message.text).toContain("LOST_IN_TRANSIT");
    });
});

describe("le courriel de décision, aux deux parties", () => {
    const COMMENT = "La photo montre un fermoir cassé à la livraison.";
    const decision = (
        outcome: "DECIDED_FOR_BUYER" | "DECIDED_FOR_VENDOR",
        party: "BUYER" | "VENDOR",
        locale = "fr",
    ) => buildDisputeDecisionMessage({ reference: REFERENCE, outcome, party, comment: COMMENT, link: LINK }, locale);

    it("porte la référence, le commentaire tel quel et le lien", () => {
        const message = decision("DECIDED_FOR_BUYER", "BUYER");
        expect(message.recipient).toBe("");
        expect(message.subject).toContain(REFERENCE);
        expect(message.text).toContain(COMMENT);
        expect(message.text).toContain(LINK);
    });

    // Chaque partie lit ce qui la concerne : l'acheteur qu'il sera servi, le vendeur qu'il
    // doit servir. Deux textes identiques diraient à l'un ce qui s'adresse à l'autre.
    it("écrit quatre corps différents, un par issue et par partie", () => {
        const corps = new Set([
            decision("DECIDED_FOR_BUYER", "BUYER").text,
            decision("DECIDED_FOR_BUYER", "VENDOR").text,
            decision("DECIDED_FOR_VENDOR", "BUYER").text,
            decision("DECIDED_FOR_VENDOR", "VENDOR").text,
        ]);
        expect(corps.size).toBe(4);
    });

    it("parle anglais à qui le lit, dans les quatre cas, et retombe sur le français sinon", () => {
        for (const outcome of ["DECIDED_FOR_BUYER", "DECIDED_FOR_VENDOR"] as const) {
            for (const party of ["BUYER", "VENDOR"] as const) {
                const anglais = decision(outcome, party, "en");
                expect(anglais.subject).toContain(REFERENCE);
                expect(anglais.text).not.toBe(decision(outcome, party, "fr").text);
            }
        }
        expect(decision("DECIDED_FOR_VENDOR", "BUYER", "es")).toEqual(
            decision("DECIDED_FOR_VENDOR", "BUYER", "fr"),
        );
    });
});
