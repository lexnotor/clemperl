import { describe, expect, it } from "vitest";
import { E_REALTIME_EVENT } from "../enums/index.js";
import { REALTIME_EVENTS_QUEUE, REALTIME_SOCKET_EVENT } from "./realtime.constant.js";

// Ces valeurs sont un contrat entre les fronts, la file et le navigateur : un test les fige.
describe("vocabulaire temps réel", () => {
    it("fige les noms de la file et de l'événement Socket.IO", () => {
        expect(REALTIME_EVENTS_QUEUE).toBe("realtime-events");
        expect(REALTIME_SOCKET_EVENT).toBe("realtime");
    });

    it("fige les types d'événements", () => {
        expect(Object.values(E_REALTIME_EVENT)).toEqual([
            "order.placed",
            "order.status_changed",
            "payment.status_changed",
            "product_image.processed",
            "dispute.opened",
            "dispute.message_posted",
            "dispute.decided",
            "dispute.served",
        ]);
    });
});
