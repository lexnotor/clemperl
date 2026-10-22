import {
    ERROR_PAYMENT_ORDER_NOT_FOUND,
    ERROR_PAYMENT_REF_UNKNOWN,
    applyProviderEvent,
    prisma,
    readOrderToPay,
    readVendorForMember,
    recordAttempt,
    settleOffline,
} from "@clemperl/db";
import { NotFoundException } from "@nestjs/common";
import {
    SIGNATURE_HEADER,
    SIMULATED_PROVIDER,
    buildRegistry,
    signSimulatedPayload,
} from "../adapters";
import { ERROR_NO_ADAPTER, ERROR_NOT_A_MEMBER, ERROR_PROVIDER_UNKNOWN } from "../constants";
import type { IPaymentsEnv } from "../interfaces";
import { decryptPayload } from "../utils";
import type { RealtimeService } from "../../realtime/services";
import { PaymentsService } from "./payments.service";

// Les dépôts sont remplacés ; les constantes d'erreur restent les vraies, pour que les
// codes comparés ici soient ceux que le dépôt lève.
jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    applyProviderEvent: jest.fn(),
    readOrderToPay: jest.fn(),
    readVendorForMember: jest.fn(),
    recordAttempt: jest.fn(),
    settleOffline: jest.fn(),
}));

const SECRET = "secret-de-test";
const ENV: IPaymentsEnv = {
    payloadKey: Buffer.alloc(32, 9),
    simulator: true,
    simulatorSecret: SECRET,
    apiPublicUrl: "http://api.test",
    storefrontUrl: "http://storefront.test",
};

const order = (method: string) => ({
    id: "order-1",
    reference: "CP-1",
    amount: 12500,
    currency: "EUR",
    method,
});

const publish = jest.fn();

// Les trois issues que le dépôt distingue : la commande a bougé ; seule la tentative a bougé
// (un événement en attente, ou l'issue tardive d'une tentative sur une commande déjà réglée) ;
// rien n'a bougé, c'est un rejeu.
const orderMoved = { changed: true, orderStatusChanged: true, orderId: "order_1" };
const attemptMovedOnly = { changed: true, orderStatusChanged: false, orderId: "order_1" };
const replay = { changed: false, orderStatusChanged: false, orderId: "order_1" };

const service = (simulator = true) =>
    new PaymentsService(
        buildRegistry({ simulator, secret: SECRET, publicUrl: ENV.apiPublicUrl }),
        ENV,
        { publish } as unknown as RealtimeService,
    );

// Un webhook réellement signé : l'adapter simulé est le vrai, seule la base est remplacée.
const signed = (body: object) => {
    const raw = JSON.stringify(body);
    return { raw, headers: { [SIGNATURE_HEADER]: signSimulatedPayload(SECRET, raw) } };
};

beforeEach(() => {
    jest.resetAllMocks();
});

describe("PaymentsService.start", () => {
    it("rend l'URL du fournisseur, après avoir lu la commande de CET acheteur", async () => {
        jest.mocked(readOrderToPay).mockResolvedValue(order("CARD"));

        const url = await service().start({ buyerId: "buyer-1", orderId: "order-1", locale: "fr" });

        expect(readOrderToPay).toHaveBeenCalledWith(prisma, {
            buyerId: "buyer-1",
            orderId: "order-1",
        });
        expect(new URL(url).origin).toBe("http://api.test");
    });

    it("donne au fournisseur une adresse de retour dans la langue de l'acheteur", async () => {
        jest.mocked(readOrderToPay).mockResolvedValue(order("MOBILE_MONEY"));

        const url = await service().start({ buyerId: "b", orderId: "order-1", locale: "en" });

        const params = new URL(url).searchParams;
        expect(params.get("returnUrl")).toBe("http://storefront.test/en/orders/CP-1");
        expect(params.get("amount")).toBe("12500");
        expect(params.get("currency")).toBe("EUR");
        expect(params.get("reference")).toBe("CP-1");
    });

    it("écrit la tentative avec la référence que le fournisseur vient de donner", async () => {
        jest.mocked(readOrderToPay).mockResolvedValue(order("CARD"));

        const url = await service().start({ buyerId: "b", orderId: "order-1", locale: "fr" });

        const providerRef = new URL(url).pathname.split("/").pop();
        expect(recordAttempt).toHaveBeenCalledWith(prisma, {
            orderId: "order-1",
            method: "CARD",
            amount: 12500,
            currency: "EUR",
            provider: SIMULATED_PROVIDER,
            providerRef,
        });
    });

    // Rendre l'URL sans trace de la tentative enverrait l'acheteur payer, puis refuserait
    // son webhook sur une référence inconnue.
    it("ne rend pas d'URL quand la tentative n'a pas pu être écrite", async () => {
        jest.mocked(readOrderToPay).mockResolvedValue(order("CARD"));
        jest.mocked(recordAttempt).mockRejectedValue(new Error("base indisponible"));

        await expect(
            service().start({ buyerId: "b", orderId: "order-1", locale: "fr" }),
        ).rejects.toMatchObject({ message: "base indisponible" });
    });

    it("refuse une méthode sans adapter, sans rien écrire", async () => {
        jest.mocked(readOrderToPay).mockResolvedValue(order("CASH_ON_DELIVERY"));

        await expect(
            service().start({ buyerId: "b", orderId: "order-1", locale: "fr" }),
        ).rejects.toMatchObject({ message: ERROR_NO_ADAPTER });
        expect(recordAttempt).not.toHaveBeenCalled();
    });

    it("refuse une carte quand le simulateur est éteint", async () => {
        jest.mocked(readOrderToPay).mockResolvedValue(order("CARD"));

        await expect(
            service(false).start({ buyerId: "b", orderId: "order-1", locale: "fr" }),
        ).rejects.toMatchObject({ message: ERROR_NO_ADAPTER });
    });

    it("laisse passer le refus du dépôt, sans interroger de fournisseur", async () => {
        jest.mocked(readOrderToPay).mockRejectedValue(new Error(ERROR_PAYMENT_ORDER_NOT_FOUND));

        await expect(
            service().start({ buyerId: "b", orderId: "autre", locale: "fr" }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_ORDER_NOT_FOUND });
        expect(recordAttempt).not.toHaveBeenCalled();
    });
});

describe("PaymentsService.settle", () => {
    it("pointe l'encaissement pour la boutique du membre", async () => {
        jest.mocked(readVendorForMember).mockResolvedValue({ id: "vendor-1" } as never);

        await service().settle({ userId: "user-1", orderId: "order-1" });

        expect(readVendorForMember).toHaveBeenCalledWith(prisma, "user-1");
        expect(settleOffline).toHaveBeenCalledWith(prisma, {
            vendorId: "vendor-1",
            orderId: "order-1",
            userId: "user-1",
            // Simulateur allumé : carte et mobile money ont un adapter, donc ne se pointent pas.
            offlineMethods: ["CASH_ON_DELIVERY", "BANK_TRANSFER", "OFF_PLATFORM"],
        });
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith({
            kind: "payment.status_changed",
            orderId: "order-1",
            by: "VENDOR",
        });
    });

    it("compte toutes les méthodes pour hors ligne quand le simulateur est éteint", async () => {
        jest.mocked(readVendorForMember).mockResolvedValue({ id: "vendor-1" } as never);

        await service(false).settle({ userId: "user-1", orderId: "order-1" });

        expect(settleOffline).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                offlineMethods: [
                    "CARD",
                    "MOBILE_MONEY",
                    "CASH_ON_DELIVERY",
                    "BANK_TRANSFER",
                    "OFF_PLATFORM",
                ],
            }),
        );
    });

    it("refuse quelqu'un qui n'est membre d'aucune boutique, sans rien écrire", async () => {
        jest.mocked(readVendorForMember).mockResolvedValue(null);

        await expect(
            service().settle({ userId: "user-1", orderId: "order-1" }),
        ).rejects.toMatchObject({ message: ERROR_NOT_A_MEMBER });
        expect(settleOffline).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it("n'émet rien quand le pointage est refusé", async () => {
        jest.mocked(readVendorForMember).mockResolvedValue({ id: "vendor-1" } as never);
        jest.mocked(settleOffline).mockRejectedValue(new Error("refus"));

        await expect(
            service().settle({ userId: "user-1", orderId: "order-1" }),
        ).rejects.toMatchObject({ message: "refus" });
        expect(publish).not.toHaveBeenCalled();
    });
});

describe("PaymentsService.receive", () => {
    it("applique un événement signé et stocke son payload chiffré, tel que reçu", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(orderMoved);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });

        const accepted = await service().receive({ provider: SIMULATED_PROVIDER, raw, headers });

        expect(accepted).toBe(true);
        const [client, input] = jest.mocked(applyProviderEvent).mock.calls[0] ?? [];
        expect(client).toBe(prisma);
        expect(input).toMatchObject({
            provider: SIMULATED_PROVIDER,
            providerRef: "sim_1",
            status: "SETTLED",
        });
        // Le stocké n'est pas le clair, et se déchiffre en exactement ce qui est arrivé.
        expect(input?.rawPayload.toString("utf8")).not.toContain("sim_1");
        expect(decryptPayload(ENV.payloadKey, input?.rawPayload as Buffer)).toBe(raw);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith({
            kind: "payment.status_changed",
            orderId: "order_1",
            by: "PROVIDER",
        });
    });

    it("émet aussi pour un paiement échoué", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(orderMoved);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "FAILED" });

        await service().receive({ provider: SIMULATED_PROVIDER, raw, headers });

        expect(publish).toHaveBeenCalledTimes(1);
    });

    it("n'émet rien pour un événement en attente, l'état de paiement n'ayant pas bougé", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(attemptMovedOnly);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "PENDING" });

        await service().receive({ provider: SIMULATED_PROVIDER, raw, headers });

        expect(publish).not.toHaveBeenCalled();
    });

    it("n'émet rien pour un rejeu", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(replay);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });

        await service().receive({ provider: SIMULATED_PROVIDER, raw, headers });

        expect(publish).not.toHaveBeenCalled();
    });

    // Deux onglets laissent deux tentatives ouvertes : l'issue tardive de celle qui n'a pas
    // abouti bouge sa trace, pas la commande que l'autre a réglée, et n'alerte personne.
    it("n'émet rien quand la tentative bouge sans que la commande bouge", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(attemptMovedOnly);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "FAILED" });

        await expect(
            service().receive({ provider: SIMULATED_PROVIDER, raw, headers }),
        ).resolves.toBe(true);
        expect(publish).not.toHaveBeenCalled();
    });

    it("n'émet rien quand la commande n'est pas connue", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue({ ...orderMoved, orderId: null });
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });

        await service().receive({ provider: SIMULATED_PROVIDER, raw, headers });

        expect(publish).not.toHaveBeenCalled();
    });

    it("transmet un événement en attente tel quel", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(attemptMovedOnly);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "PENDING" });

        await service().receive({ provider: SIMULATED_PROVIDER, raw, headers });

        expect(applyProviderEvent).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ status: "PENDING" }),
        );
    });

    // Le fournisseur rejoue ses webhooks tant qu'il ne reçoit pas 200 : un rejeu n'est pas
    // un échec.
    it("tient un rejeu pour accepté", async () => {
        jest.mocked(applyProviderEvent).mockResolvedValue(replay);
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });

        await expect(
            service().receive({ provider: SIMULATED_PROVIDER, raw, headers }),
        ).resolves.toBe(true);
    });

    it("refuse une signature fausse sans rien écrire", async () => {
        const { raw } = signed({ providerRef: "sim_1", status: "SETTLED" });

        await expect(
            service().receive({
                provider: SIMULATED_PROVIDER,
                raw,
                headers: { [SIGNATURE_HEADER]: "0".repeat(64) },
            }),
        ).resolves.toBe(false);
        expect(applyProviderEvent).not.toHaveBeenCalled();
    });

    it("refuse un corps non signé sans rien écrire", async () => {
        await expect(
            service().receive({ provider: SIMULATED_PROVIDER, raw: "{}", headers: {} }),
        ).resolves.toBe(false);
        expect(applyProviderEvent).not.toHaveBeenCalled();
    });

    it("répond 404 pour un fournisseur inconnu, avant de lire le corps", async () => {
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });

        const attempt = service().receive({ provider: "STRIPE", raw, headers });

        await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
        await expect(attempt).rejects.toMatchObject({ message: ERROR_PROVIDER_UNKNOWN });
        expect(applyProviderEvent).not.toHaveBeenCalled();
    });

    it("ne connaît aucun fournisseur quand le simulateur est éteint", async () => {
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });

        await expect(
            service(false).receive({ provider: SIMULATED_PROVIDER, raw, headers }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("laisse remonter une référence inconnue, que le contrôleur traduit en 404", async () => {
        jest.mocked(applyProviderEvent).mockRejectedValue(new Error(ERROR_PAYMENT_REF_UNKNOWN));
        const { raw, headers } = signed({ providerRef: "sim_x", status: "SETTLED" });

        await expect(
            service().receive({ provider: SIMULATED_PROVIDER, raw, headers }),
        ).rejects.toMatchObject({ message: ERROR_PAYMENT_REF_UNKNOWN });
        expect(publish).not.toHaveBeenCalled();
    });
});
