import { Logger, Module, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { PAYMENTS_ENV } from "./modules/payments/constants";
import { SimulatorController, WebhookController } from "./modules/payments/controllers";
import type { IPaymentsEnv } from "./modules/payments/interfaces";
import { PaymentsService } from "./modules/payments/services";
import { createApp } from "./app.factory";

const ORIGINS = {
    NEXT_PUBLIC_STOREFRONT_URL: "http://storefront.test",
    NEXT_PUBLIC_VENDOR_URL: "http://vendor.test/",
    NEXT_PUBLIC_ADMIN_URL: "http://admin.test",
};

const receive = jest.fn();

const simulatorEnv: IPaymentsEnv = {
    payloadKey: Buffer.alloc(32, 1),
    simulator: true,
    simulatorSecret: "secret-de-test",
    apiPublicUrl: "http://api.test",
    storefrontUrl: "http://storefront.test",
};

// Un module réduit aux contrôleurs dont la configuration de l'application décide du
// comportement : le corps brut du webhook et la redirection du simulateur.
@Module({
    controllers: [WebhookController, SimulatorController],
    providers: [
        { provide: PaymentsService, useValue: { receive } },
        { provide: PAYMENTS_ENV, useValue: simulatorEnv },
    ],
})
class StubModule {}

const saved = { ...process.env };
const apps: INestApplication[] = [];

async function build(env: Record<string, string | undefined>): Promise<INestApplication> {
    for (const name of Object.keys(ORIGINS)) {
        delete process.env[name];
    }
    Object.assign(process.env, env);
    const app = await createApp(StubModule);
    await app.init();
    apps.push(app);
    return app;
}

beforeAll(() => {
    Logger.overrideLogger(false);
});

beforeEach(() => {
    receive.mockReset();
});

afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(apps.splice(0).map((app) => app.close()));
    for (const name of Object.keys(ORIGINS)) {
        delete process.env[name];
    }
    Object.assign(process.env, saved);
});

describe("createApp", () => {
    // Sans `{ rawBody: true }` à la création, le service reçoit une chaîne vide : toute
    // signature échoue, et rien ne dit que c'est la configuration qui est en cause.
    it("donne au webhook les octets reçus, tels quels", async () => {
        receive.mockResolvedValue(true);
        const app = await build(ORIGINS);
        const raw = '{ "providerRef" : "sim_1",  "status":"SETTLED" }';

        await request(app.getHttpServer())
            .post("/payments/webhook/SIMULATED")
            .set("content-type", "application/json")
            .set("X-Clemperl-Signature", "abc")
            .send(raw)
            .expect(200, { received: true });

        expect(receive).toHaveBeenCalledWith({
            provider: "SIMULATED",
            raw,
            headers: expect.objectContaining({ "x-clemperl-signature": "abc" }),
        });
    });

    // Un `@Redirect()` retiré ferait répondre 201 avec un objet JSON, au lieu de renvoyer
    // l'acheteur, et le formulaire du simulateur n'aboutirait nulle part.
    it("fait aboutir le formulaire du simulateur en 303 vers la vitrine", async () => {
        jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
        const app = await build(ORIGINS);

        const response = await request(app.getHttpServer())
            .post("/payments/simulator/sim_1")
            .type("form")
            .send({ outcome: "SETTLED", returnUrl: "http://storefront.test/fr/orders/CP-1" });

        expect(response.status).toBe(303);
        expect(response.headers["location"]).toBe("http://storefront.test/fr/orders/CP-1");
    });

    // Le joker est incompatible avec l'envoi d'un cookie : l'origine est répétée telle
    // qu'elle a été demandée, jamais `*`.
    it("nomme l'origine autorisée et accepte les cookies", async () => {
        const app = await build(ORIGINS);

        const response = await request(app.getHttpServer())
            .options("/payments/start")
            .set("Origin", "http://vendor.test")
            .set("Access-Control-Request-Method", "POST");

        expect(response.headers["access-control-allow-origin"]).toBe("http://vendor.test");
        expect(response.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("n'accorde rien à une origine inconnue", async () => {
        const app = await build(ORIGINS);

        const response = await request(app.getHttpServer())
            .options("/payments/start")
            .set("Origin", "http://ailleurs.test")
            .set("Access-Control-Request-Method", "POST");

        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    // Aucune variable renseignée : la liste est vide, et la réponse ne doit pas retomber sur
    // un joker.
    it("n'accorde rien à personne quand aucune origine n'est configurée", async () => {
        const app = await build({});

        const response = await request(app.getHttpServer())
            .options("/payments/start")
            .set("Origin", "http://storefront.test")
            .set("Access-Control-Request-Method", "POST");

        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
});
