import { describe, expect, it } from "vitest";
import { realtimeRecipients } from "./realtime-recipients.utils.js";

describe("destinataires d'un événement temps réel", () => {
    it("prévient la boutique d'une commande passée", () => {
        expect(realtimeRecipients({ kind: "order.placed", orderId: "o1" })).toEqual(["SHOP"]);
    });

    it("prévient seulement l'acheteur quand le vendeur fait avancer sa commande", () => {
        expect(
            realtimeRecipients({ kind: "order.status_changed", orderId: "o1", by: "VENDOR" }),
        ).toEqual(["BUYER"]);
    });

    it("prévient les deux quand l'administration fait avancer une commande", () => {
        expect(
            realtimeRecipients({ kind: "order.status_changed", orderId: "o1", by: "ADMIN" }),
        ).toEqual(["BUYER", "SHOP"]);
    });

    it("prévient seulement l'acheteur quand le vendeur règle le paiement", () => {
        expect(
            realtimeRecipients({ kind: "payment.status_changed", orderId: "o1", by: "VENDOR" }),
        ).toEqual(["BUYER"]);
    });

    it("prévient les deux quand le prestataire règle le paiement", () => {
        expect(
            realtimeRecipients({ kind: "payment.status_changed", orderId: "o1", by: "PROVIDER" }),
        ).toEqual(["BUYER", "SHOP"]);
    });

    it("prévient la boutique d'une image traitée", () => {
        expect(realtimeRecipients({ kind: "product_image.processed", imageId: "i1" })).toEqual([
            "SHOP",
        ]);
    });

    it("prévient la boutique d'un litige ouvert", () => {
        expect(realtimeRecipients({ kind: "dispute.opened", disputeId: "d1" })).toEqual(["SHOP"]);
    });

    it("prévient la boutique d'un message de l'acheteur", () => {
        expect(
            realtimeRecipients({ kind: "dispute.message_posted", disputeId: "d1", by: "BUYER" }),
        ).toEqual(["SHOP"]);
    });

    it("prévient l'acheteur d'un message du vendeur", () => {
        expect(
            realtimeRecipients({ kind: "dispute.message_posted", disputeId: "d1", by: "VENDOR" }),
        ).toEqual(["BUYER"]);
    });

    it("prévient les deux d'un litige tranché", () => {
        expect(realtimeRecipients({ kind: "dispute.decided", disputeId: "d1" })).toEqual([
            "BUYER",
            "SHOP",
        ]);
    });

    it("prévient la boutique d'un litige notifié", () => {
        expect(realtimeRecipients({ kind: "dispute.served", disputeId: "d1" })).toEqual(["SHOP"]);
    });
});
