import type { TRealtimeEvent } from "@clemperl/core";
import {
    prisma,
    readDisputeAudience,
    readOrderAudience,
    readProductImageAudience,
} from "@clemperl/db";
import { Logger } from "@nestjs/common";
import type { RealtimeGateway } from "../controllers";
import { RealtimeService } from "./realtime.service";

// Les lectures sont remplacées. La règle « qui prévenir » reste la vraie, celle du domaine :
// c'est elle que ces tests confrontent aux salles visées.
jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    readOrderAudience: jest.fn(),
    readDisputeAudience: jest.fn(),
    readProductImageAudience: jest.fn(),
}));

const AUDIENCE = { buyerId: "buyer-1", vendorId: "vendor-1", reference: "CP-1" };
const BUYER = "user:buyer-1";
const SHOP = "shop:vendor-1";

function build() {
    const emitTo = jest.fn();
    return { emitTo, service: new RealtimeService({ emitTo } as unknown as RealtimeGateway) };
}

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("RealtimeService.publish, une commande", () => {
    it.each<[TRealtimeEvent, string[]]>([
        [{ kind: "order.placed", orderId: "order-1" }, [SHOP]],
        [{ kind: "order.status_changed", orderId: "order-1", by: "VENDOR" }, [BUYER]],
        [{ kind: "order.status_changed", orderId: "order-1", by: "ADMIN" }, [BUYER, SHOP]],
        [{ kind: "payment.status_changed", orderId: "order-1", by: "VENDOR" }, [BUYER]],
        [{ kind: "payment.status_changed", orderId: "order-1", by: "PROVIDER" }, [BUYER, SHOP]],
    ])("%o est émis vers %o, avec la référence", async (event, rooms) => {
        jest.mocked(readOrderAudience).mockResolvedValue(AUDIENCE);
        const { service, emitTo } = build();

        await service.publish(event);

        expect(readOrderAudience).toHaveBeenCalledWith(prisma, "order-1");
        expect(emitTo).toHaveBeenCalledTimes(1);
        // Égalité stricte de l'avis : rien d'autre que le genre et la référence n'en sort.
        expect(emitTo).toHaveBeenCalledWith(rooms, { kind: event.kind, reference: "CP-1" });
    });
});

describe("RealtimeService.publish, un litige", () => {
    it.each<[TRealtimeEvent, string[]]>([
        [{ kind: "dispute.opened", disputeId: "dispute-1" }, [SHOP]],
        [{ kind: "dispute.message_posted", disputeId: "dispute-1", by: "BUYER" }, [SHOP]],
        [{ kind: "dispute.message_posted", disputeId: "dispute-1", by: "VENDOR" }, [BUYER]],
        [{ kind: "dispute.decided", disputeId: "dispute-1" }, [BUYER, SHOP]],
        [{ kind: "dispute.served", disputeId: "dispute-1" }, [SHOP]],
    ])("%o est émis vers %o, avec la référence de la commande", async (event, rooms) => {
        jest.mocked(readDisputeAudience).mockResolvedValue(AUDIENCE);
        const { service, emitTo } = build();

        await service.publish(event);

        expect(readDisputeAudience).toHaveBeenCalledWith(prisma, "dispute-1");
        expect(emitTo).toHaveBeenCalledTimes(1);
        expect(emitTo).toHaveBeenCalledWith(rooms, { kind: event.kind, reference: "CP-1" });
    });
});

describe("RealtimeService.publish, une image", () => {
    const event: TRealtimeEvent = { kind: "product_image.processed", imageId: "image-1" };

    it.each(["READY", "FAILED"] as const)(
        "une image %s est annoncée à la boutique, avec le titre du produit",
        async (status) => {
            jest.mocked(readProductImageAudience).mockResolvedValue({
                vendorId: "vendor-1",
                productTitle: "Sac en cuir",
                status,
            });
            const { service, emitTo } = build();

            await service.publish(event);

            expect(readProductImageAudience).toHaveBeenCalledWith(prisma, "image-1");
            expect(emitTo).toHaveBeenCalledWith([SHOP], {
                kind: "product_image.processed",
                productTitle: "Sac en cuir",
                imageStatus: status,
            });
        },
    );

    // L'image est repartie en traitement entre l'événement et sa lecture : le vendeur a
    // demandé un nouvel essai. Annoncer l'issue précédente serait faux, et le nouveau
    // traitement annoncera la sienne.
    it("une image revenue en attente n'est pas annoncée", async () => {
        jest.mocked(readProductImageAudience).mockResolvedValue({
            vendorId: "vendor-1",
            productTitle: "Sac en cuir",
            status: "PENDING",
        });
        const { service, emitTo } = build();

        await expect(service.publish(event)).resolves.toBeUndefined();

        expect(emitTo).not.toHaveBeenCalled();
    });
});

describe("RealtimeService.publish, un objet disparu", () => {
    // Entre le dépôt et la consommation, l'objet a pu être supprimé : il n'y a personne à
    // prévenir, et ce n'est pas une erreur. La promesse résout, donc la file ne relance pas.
    it.each<[TRealtimeEvent, () => void]>([
        [
            { kind: "order.placed", orderId: "gone" },
            () => jest.mocked(readOrderAudience).mockResolvedValue(null),
        ],
        [
            { kind: "dispute.decided", disputeId: "gone" },
            () => jest.mocked(readDisputeAudience).mockResolvedValue(null),
        ],
        [
            { kind: "product_image.processed", imageId: "gone" },
            () => jest.mocked(readProductImageAudience).mockResolvedValue(null),
        ],
    ])("%o est abandonné sans émission ni erreur", async (event, vanish) => {
        vanish();
        const { service, emitTo } = build();

        await expect(service.publish(event)).resolves.toBeUndefined();

        expect(emitTo).not.toHaveBeenCalled();
        expect(Logger.prototype.error).not.toHaveBeenCalled();
    });
});

describe("RealtimeService.publish, une panne", () => {
    // L'appelant vient d'écrire : une alerte perdue se rattrape au prochain affichage de la
    // page, une écriture rendue en échec ne se rattrape pas.
    it("ne rejette pas quand la base est injoignable, et le journalise", async () => {
        jest.mocked(readOrderAudience).mockRejectedValue(new Error("base coupée"));
        const { service, emitTo } = build();

        await expect(
            service.publish({ kind: "order.placed", orderId: "order-1" }),
        ).resolves.toBeUndefined();

        expect(emitTo).not.toHaveBeenCalled();
        expect(Logger.prototype.error).toHaveBeenCalled();
    });

    // La file rend les données d'un job telles qu'elle les a, et rien ne garantit qu'il en ait :
    // la lecture lève, et le journal de l'échec ne doit pas lever à son tour en nommant le
    // genre d'un événement absent.
    it("ne rejette pas sur un job sans événement", async () => {
        const { service, emitTo } = build();

        await expect(service.publish(undefined as never)).resolves.toBeUndefined();

        expect(emitTo).not.toHaveBeenCalled();
        expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it("ne rejette pas quand l'émission échoue", async () => {
        jest.mocked(readOrderAudience).mockResolvedValue(AUDIENCE);
        const { service, emitTo } = build();
        emitTo.mockImplementation(() => {
            throw new Error("serveur Socket.IO absent");
        });

        await expect(
            service.publish({ kind: "order.placed", orderId: "order-1" }),
        ).resolves.toBeUndefined();

        expect(Logger.prototype.error).toHaveBeenCalled();
    });
});
