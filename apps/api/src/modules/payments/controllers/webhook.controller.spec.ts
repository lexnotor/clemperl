import { ERROR_PAYMENT_REF_UNKNOWN } from "@clemperl/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ERROR_SIGNATURE_REFUSED } from "../constants";
import type { PaymentsService } from "../services";
import { WebhookController } from "./webhook.controller";

function build() {
    const service = { receive: jest.fn() };
    return {
        service,
        controller: new WebhookController(service as unknown as PaymentsService),
    };
}

describe("WebhookController", () => {
    // Le webhook ne vient pas d'un navigateur : une session ou une origine exigées ici le
    // fermeraient au fournisseur, et rien ne dirait pourquoi ses appels échouent.
    it("n'est gardé ni par la session ni par l'origine", () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, WebhookController)).toBeUndefined();
        expect(
            Reflect.getMetadata(GUARDS_METADATA, WebhookController.prototype.receive),
        ).toBeUndefined();
    });

    // `createHmac.update(undefined)` lève : l'adapter doit recevoir une CHAÎNE, et la
    // même que celle qui a été signée.
    it("transmet le corps brut en chaîne, sans le relire", async () => {
        const { controller, service } = build();
        service.receive.mockResolvedValue(true);
        const raw = '{ "providerRef" : "sim_1",  "status":"SETTLED" }';

        const answer = await controller.receive("SIMULATED", {
            rawBody: Buffer.from(raw, "utf8"),
            headers: {},
        });

        expect(answer).toEqual({ received: true });
        expect(service.receive).toHaveBeenCalledWith({
            provider: "SIMULATED",
            raw,
            headers: {},
        });
    });

    it("conserve les caractères de plusieurs octets du corps", async () => {
        const { controller, service } = build();
        service.receive.mockResolvedValue(true);

        await controller.receive("SIMULATED", {
            rawBody: Buffer.from('{"note":"réglé €"}', "utf8"),
            headers: {},
        });

        expect(service.receive).toHaveBeenCalledWith(
            expect.objectContaining({ raw: '{"note":"réglé €"}' }),
        );
    });

    // Sans `{ rawBody: true }` à la création de l'application, `rawBody` est indéfini. La
    // chaîne vide ne porte aucune signature valide : la requête est refusée, pas écrite.
    it("passe une chaîne vide, et non `undefined`, quand le corps brut manque", async () => {
        const { controller, service } = build();
        service.receive.mockResolvedValue(false);

        await expect(controller.receive("SIMULATED", { headers: {} })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(service.receive).toHaveBeenCalledWith(expect.objectContaining({ raw: "" }));
    });

    it("transmet les en-têtes en minuscules, et en chaînes seulement", async () => {
        const { controller, service } = build();
        service.receive.mockResolvedValue(true);

        await controller.receive("SIMULATED", {
            rawBody: Buffer.from("{}"),
            headers: {
                "X-Clemperl-Signature": "abc",
                "set-cookie": ["a=1", "b=2"],
                "x-absent": undefined,
            },
        });

        expect(service.receive).toHaveBeenCalledWith(
            expect.objectContaining({ headers: { "x-clemperl-signature": "abc" } }),
        );
    });

    it("répond 400 avec un code, sans phrase, quand la signature est refusée", async () => {
        const { controller, service } = build();
        service.receive.mockResolvedValue(false);

        const attempt = controller.receive("SIMULATED", {
            rawBody: Buffer.from("{}"),
            headers: {},
        });

        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toMatchObject({ message: ERROR_SIGNATURE_REFUSED });
    });

    it("répond 404 pour une référence que la plateforme n'a jamais démarrée", async () => {
        const { controller, service } = build();
        service.receive.mockRejectedValue(new Error(ERROR_PAYMENT_REF_UNKNOWN));

        const attempt = controller.receive("SIMULATED", {
            rawBody: Buffer.from("{}"),
            headers: {},
        });

        await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
        await expect(attempt).rejects.toMatchObject({ message: ERROR_PAYMENT_REF_UNKNOWN });
    });

    it("laisse passer le 404 d'un fournisseur inconnu", async () => {
        const { controller, service } = build();
        const unknown = new NotFoundException("PAYMENT_PROVIDER_UNKNOWN");
        service.receive.mockRejectedValue(unknown);

        await expect(
            controller.receive("STRIPE", { rawBody: Buffer.from("{}"), headers: {} }),
        ).rejects.toBe(unknown);
    });

    it("relance une panne telle quelle : le fournisseur réessaiera", async () => {
        const { controller, service } = build();
        const outage = new Error("base indisponible");
        service.receive.mockRejectedValue(outage);

        await expect(
            controller.receive("SIMULATED", { rawBody: Buffer.from("{}"), headers: {} }),
        ).rejects.toBe(outage);
    });

    it("relance une valeur qui n'est pas une erreur", async () => {
        const { controller, service } = build();
        service.receive.mockRejectedValue("chaîne");

        await expect(
            controller.receive("SIMULATED", { rawBody: Buffer.from("{}"), headers: {} }),
        ).rejects.toBe("chaîne");
    });
});
