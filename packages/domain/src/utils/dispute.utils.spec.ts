import { describe, expect, it } from "vitest";
import { E_DISPUTE_ACTION } from "../constants/dispute.constant.js";
import { ForbiddenDisputeTransitionError } from "../errors/dispute.error.js";
import {
    advanceDispute,
    allowedDisputeActions,
    canOpenDispute,
    disputeOpeningCutoff,
    isDisputeRipe,
    validateDisputeDecision,
    validateDisputeMessage,
    validateDisputeOpening,
} from "./dispute.utils.js";

// Les dates sont des littéraux : une attente calculée par le code testé passerait quoi
// qu'il fasse.
const NOW = new Date("2026-10-19T12:00:00.000Z");
const shipped = (iso: string) => ({
    status: "SHIPPED",
    shippedAt: new Date(iso),
    hasDispute: false,
});
const keys = (violations: readonly { i18nKey: string }[]) => violations.map((v) => v.i18nKey);

describe("ouvrir un litige", () => {
    it("accepte une commande expédiée il y a exactement quatorze jours", () => {
        expect(canOpenDispute(shipped("2026-10-05T12:00:00.000Z"), NOW)).toBe(true);
    });

    it("refuse une milliseconde au-delà", () => {
        expect(canOpenDispute(shipped("2026-10-05T11:59:59.999Z"), NOW)).toBe(false);
    });

    // Les commandes expédiées avant que la date existe n'en ont pas : elles n'ouvrent rien.
    it("refuse une commande sans date d'expédition", () => {
        expect(canOpenDispute({ status: "SHIPPED", shippedAt: null, hasDispute: false }, NOW)).toBe(
            false,
        );
    });

    // Une commande acceptée et jamais reçue n'est pas un litige : rien n'est parti.
    it("refuse une commande qui n'est pas expédiée", () => {
        expect(
            canOpenDispute(
                { status: "ACCEPTED", shippedAt: new Date("2026-10-18T12:00:00.000Z"), hasDispute: false },
                NOW,
            ),
        ).toBe(false);
    });

    it("refuse une commande déjà contestée", () => {
        expect(
            canOpenDispute({ ...shipped("2026-10-18T12:00:00.000Z"), hasDispute: true }, NOW),
        ).toBe(false);
    });

    it("rend la coupure à quatorze jours", () => {
        expect(disputeOpeningCutoff(NOW).toISOString()).toBe("2026-10-05T12:00:00.000Z");
    });
});

describe("un litige à trancher", () => {
    it("l'est après exactement sept jours de silence", () => {
        expect(isDisputeRipe(new Date("2026-10-12T12:00:00.000Z"), NOW)).toBe(true);
    });

    it("ne l'est pas une milliseconde avant", () => {
        expect(isDisputeRipe(new Date("2026-10-12T12:00:00.001Z"), NOW)).toBe(false);
    });
});

describe("les transitions d'un litige", () => {
    it("laisse l'administration trancher un litige ouvert, dans un sens ou dans l'autre", () => {
        expect(advanceDispute("OPEN", E_DISPUTE_ACTION.DECIDE_FOR_BUYER)).toBe("DECIDED_FOR_BUYER");
        expect(advanceDispute("OPEN", E_DISPUTE_ACTION.DECIDE_FOR_VENDOR)).toBe("DECIDED_FOR_VENDOR");
    });

    // L'acheteur peut se dire servi avant toute décision : un vendeur qui répare dès sa
    // première réponse n'a jamais besoin de l'administration.
    it("laisse servir un litige ouvert", () => {
        expect(advanceDispute("OPEN", E_DISPUTE_ACTION.SERVE)).toBe("SERVED");
    });

    it("laisse servir un litige tranché pour l'acheteur", () => {
        expect(advanceDispute("DECIDED_FOR_BUYER", E_DISPUTE_ACTION.SERVE)).toBe("SERVED");
    });

    it("refuse de trancher deux fois", () => {
        expect(() => advanceDispute("DECIDED_FOR_VENDOR", E_DISPUTE_ACTION.DECIDE_FOR_BUYER)).toThrow(
            ForbiddenDisputeTransitionError,
        );
        expect(() => advanceDispute("DECIDED_FOR_BUYER", E_DISPUTE_ACTION.DECIDE_FOR_VENDOR)).toThrow(
            ForbiddenDisputeTransitionError,
        );
    });

    it("ferme un litige tranché pour le vendeur, et un litige servi", () => {
        expect(allowedDisputeActions("DECIDED_FOR_VENDOR")).toEqual([]);
        expect(allowedDisputeActions("SERVED")).toEqual([]);
    });

    it("offre les trois actions sur un litige ouvert", () => {
        expect(allowedDisputeActions("OPEN").sort()).toEqual(
            ["DECIDE_FOR_BUYER", "DECIDE_FOR_VENDOR", "SERVE"],
        );
    });
});

describe("valider une ouverture", () => {
    const valide = {
        lineIds: ["l1"],
        reason: "DAMAGED",
        body: "Le fermoir est cassé.",
        attachments: [],
    };

    it("accepte une ouverture complète, pièces comprises", () => {
        expect(validateDisputeOpening(valide)).toEqual([]);
        expect(
            validateDisputeOpening({
                ...valide,
                attachments: [
                    { mimeType: "image/jpeg", sizeBytes: 1 },
                    { mimeType: "application/pdf", sizeBytes: 5 * 1024 * 1024 },
                ],
            }),
        ).toEqual([]);
    });

    // Tout est dit en une fois : une personne qui corrige a besoin de la liste entière.
    it("refuse quatre pièces, une pièce trop lourde et un type inconnu, en une fois", () => {
        const violations = validateDisputeOpening({
            ...valide,
            attachments: [
                { mimeType: "image/png", sizeBytes: 1 },
                { mimeType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 },
                { mimeType: "application/zip", sizeBytes: 1 },
                { mimeType: "image/jpeg", sizeBytes: 1 },
            ],
        });
        expect(keys(violations)).toEqual(
            expect.arrayContaining([
                "errors.dispute.too_many_attachments",
                "errors.dispute.attachment_too_large",
                "errors.dispute.unsupported_media_type",
            ]),
        );
    });

    // Un `select` sans choix neutre choisirait le motif à la place de l'acheteur.
    it("refuse le motif vide et un motif inventé, `constructor` compris", () => {
        for (const reason of ["", "BANANA", "constructor"]) {
            expect(keys(validateDisputeOpening({ ...valide, reason }))).toEqual([
                "errors.dispute.reason_unknown",
            ]);
        }
    });

    it("refuse aucune ligne", () => {
        expect(keys(validateDisputeOpening({ ...valide, lineIds: [] }))).toEqual([
            "errors.dispute.lines_required",
        ]);
    });

    it("refuse un récit fait d'espaces, et un récit de 5001 caractères", () => {
        expect(keys(validateDisputeOpening({ ...valide, body: "  \n " }))).toEqual([
            "errors.dispute.body_required",
        ]);
        expect(keys(validateDisputeOpening({ ...valide, body: "a".repeat(5001) }))).toEqual([
            "errors.dispute.body_too_long",
        ]);
        expect(validateDisputeOpening({ ...valide, body: "a".repeat(5000) })).toEqual([]);
    });
});

describe("valider un message", () => {
    it("accepte un message avec ses pièces", () => {
        expect(
            validateDisputeMessage({
                body: "Voici le bon de livraison signé.",
                attachments: [{ mimeType: "application/pdf", sizeBytes: 10 }],
            }),
        ).toEqual([]);
    });

    it("refuse un message vide, et des pièces irrecevables", () => {
        expect(keys(validateDisputeMessage({ body: " ", attachments: [] }))).toEqual([
            "errors.dispute.body_required",
        ]);
        expect(
            keys(
                validateDisputeMessage({
                    body: "Photo jointe.",
                    attachments: [{ mimeType: "text/plain", sizeBytes: 10 }],
                }),
            ),
        ).toEqual(["errors.dispute.unsupported_media_type"]);
    });
});

describe("valider une décision", () => {
    // Les deux parties lisent ce commentaire, et c'est la seule explication qu'elles auront.
    it("exige un commentaire qui ne soit pas fait d'espaces", () => {
        expect(keys(validateDisputeDecision({ comment: "   " }))).toEqual([
            "errors.dispute.comment_required",
        ]);
        expect(validateDisputeDecision({ comment: "La photo montre un fermoir cassé." })).toEqual([]);
    });
});

describe("l'erreur de transition", () => {
    it("porte sa clé et ses arguments", () => {
        const error = new ForbiddenDisputeTransitionError("SERVED", E_DISPUTE_ACTION.SERVE);
        expect(error.i18nKey).toBe("errors.dispute.forbidden_transition");
        expect(error.i18nArgs).toEqual({ from: "SERVED", action: "SERVE" });
    });
});
