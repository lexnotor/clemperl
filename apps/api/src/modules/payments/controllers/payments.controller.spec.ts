import {
    ERROR_PAYMENT_ALREADY_SETTLED,
    ERROR_PAYMENT_NOT_OFFLINE,
    ERROR_PAYMENT_ORDER_CANCELLED,
    ERROR_PAYMENT_ORDER_NOT_FOUND,
} from "@clemperl/db";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { SessionGuard } from "../../auth/guards";
import { ERROR_NO_ADAPTER, ERROR_NOT_A_MEMBER } from "../constants";
import { OriginGuard } from "../guards";
import type { PaymentsService } from "../services";
import { PaymentsController } from "./payments.controller";

const request = { session: { user: { id: "user-1" } } };

function build() {
    const service = { start: jest.fn(), settle: jest.fn() };
    return {
        service,
        controller: new PaymentsController(service as unknown as PaymentsService),
    };
}

describe("PaymentsController", () => {
    // Le garde d'origine se joue AVANT la session : il refuse sans lire la session, et c'est
    // ce qui fait répondre 403 à une requête sans `Origin`, avec ou sans cookie.
    it("vérifie l'origine, puis la session, sur toutes ses routes", () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, PaymentsController)).toEqual([
            OriginGuard,
            SessionGuard,
        ]);
    });

    describe("start", () => {
        it("rend l'URL de redirection pour l'acheteur de la session", async () => {
            const { controller, service } = build();
            service.start.mockResolvedValue("http://api.test/payments/simulator/sim_1");

            const answer = await controller.start(request, { orderId: "order-1", locale: "en" });

            expect(answer).toEqual({ redirectUrl: "http://api.test/payments/simulator/sim_1" });
            // L'acheteur vient de la SESSION, jamais du corps : le corps vient du client.
            expect(service.start).toHaveBeenCalledWith({
                buyerId: "user-1",
                orderId: "order-1",
                locale: "en",
            });
        });

        it("retombe sur le français pour toute autre langue", async () => {
            const { controller, service } = build();
            service.start.mockResolvedValue("url");

            await controller.start(request, { orderId: "order-1", locale: "de" });

            expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ locale: "fr" }));
        });

        // Express 5 laisse `body` indéfini sans corps : sans cette tolérance, la lecture de
        // `body.orderId` lèverait une `TypeError` et la requête sortirait en 500. Le service,
        // lui, ne reçoit jamais autre chose qu'une chaîne, et la refuse comme introuvable.
        it("transmet une commande vide quand le corps est absent ou mal typé", async () => {
            const { controller, service } = build();
            service.start.mockResolvedValue("url");

            await controller.start(request, undefined);
            await controller.start(request, { orderId: 42 });

            expect(service.start).toHaveBeenCalledTimes(2);
            for (const [call] of service.start.mock.calls) {
                expect(call).toMatchObject({ orderId: "" });
            }
        });

        it.each([
            [ERROR_PAYMENT_ORDER_NOT_FOUND, NotFoundException],
            [ERROR_PAYMENT_ORDER_CANCELLED, ConflictException],
            [ERROR_PAYMENT_ALREADY_SETTLED, ConflictException],
            [ERROR_NO_ADAPTER, ConflictException],
        ])("traduit %s en réponse HTTP qui porte le code", async (code, status) => {
            const { controller, service } = build();
            service.start.mockRejectedValue(new Error(code));

            const attempt = controller.start(request, { orderId: "order-1" });

            await expect(attempt).rejects.toBeInstanceOf(status);
            await expect(attempt).rejects.toMatchObject({ message: code });
        });

        // Une panne qui sortirait en 409 serait lue par l'écran comme un état de la commande.
        it("relance une panne telle quelle, sans la déguiser", async () => {
            const { controller, service } = build();
            const outage = new Error("connexion refusée");
            service.start.mockRejectedValue(outage);

            await expect(controller.start(request, { orderId: "order-1" })).rejects.toBe(outage);
        });

        it("relance une valeur qui n'est pas une erreur", async () => {
            const { controller, service } = build();
            service.start.mockRejectedValue("chaîne");

            await expect(controller.start(request, { orderId: "order-1" })).rejects.toBe("chaîne");
        });
    });

    describe("settle", () => {
        it("pointe l'encaissement et le dit", async () => {
            const { controller, service } = build();
            service.settle.mockResolvedValue(undefined);

            const answer = await controller.settle(request, "order-1");

            expect(answer).toEqual({ settled: true });
            expect(service.settle).toHaveBeenCalledWith({ userId: "user-1", orderId: "order-1" });
        });

        it.each([
            [ERROR_PAYMENT_ORDER_NOT_FOUND, NotFoundException],
            [ERROR_NOT_A_MEMBER, NotFoundException],
            [ERROR_PAYMENT_NOT_OFFLINE, ConflictException],
            [ERROR_PAYMENT_ALREADY_SETTLED, ConflictException],
        ])("traduit %s en réponse HTTP qui porte le code", async (code, status) => {
            const { controller, service } = build();
            service.settle.mockRejectedValue(new Error(code));

            const attempt = controller.settle(request, "order-1");

            await expect(attempt).rejects.toBeInstanceOf(status);
            await expect(attempt).rejects.toMatchObject({ message: code });
        });

        it("relance une panne telle quelle", async () => {
            const { controller, service } = build();
            const outage = new Error("connexion refusée");
            service.settle.mockRejectedValue(outage);

            await expect(controller.settle(request, "order-1")).rejects.toBe(outage);
        });
    });
});
