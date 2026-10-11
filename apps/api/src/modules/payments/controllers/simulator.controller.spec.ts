import { BadGatewayException, BadRequestException, NotFoundException } from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import { SIGNATURE_HEADER, SimulatedAdapter } from "../adapters";
import {
    ERROR_RETURN_URL_REFUSED,
    ERROR_SIMULATOR_DISABLED,
    ERROR_SIMULATOR_INPUT_INVALID,
    ERROR_WEBHOOK_REFUSED,
} from "../constants";
import type { IPaymentsEnv } from "../interfaces";
import { SimulatorController } from "./simulator.controller";

const SECRET = "secret-de-test";
const STOREFRONT = "http://storefront.test";
const RETURN_URL = `${STOREFRONT}/fr/orders/CP-1`;

const env = (simulator: boolean): IPaymentsEnv => ({
    payloadKey: Buffer.alloc(32, 1),
    simulator,
    simulatorSecret: SECRET,
    apiPublicUrl: "http://api.test",
    storefrontUrl: STOREFRONT,
});

const query = {
    amount: "12500",
    currency: "EUR",
    reference: "CP-1",
    returnUrl: RETURN_URL,
};

let fetchMock: jest.SpiedFunction<typeof fetch>;

beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
});

afterEach(() => {
    fetchMock.mockRestore();
});

describe("SimulatorController.page", () => {
    it("se sert en HTML", () => {
        expect(Reflect.getMetadata(HEADERS_METADATA, SimulatorController.prototype.page)).toEqual([
            { name: "content-type", value: "text/html; charset=utf-8" },
        ]);
    });

    it("affiche le montant formaté et la référence de la commande", () => {
        const html = new SimulatorController(env(true)).page("sim_1", query);

        expect(html).toContain("125,00");
        expect(html).toContain("<strong>CP-1</strong>");
    });

    it("formate une devise sans décimales selon son exposant", () => {
        const html = new SimulatorController(env(true)).page("sim_1", {
            ...query,
            amount: "12500",
            currency: "XOF",
        });

        expect(html).not.toContain("125,00");
        expect(html).toMatch(/12\s?500/u);
    });

    it("offre deux boutons, qui postent la même issue que leur libellé annonce", () => {
        const html = new SimulatorController(env(true)).page("sim_1", query);

        const forms = html.match(/<form[\s\S]*?<\/form>/gu) ?? [];
        expect(forms).toHaveLength(2);
        expect(forms[0]).toContain('action="/payments/simulator/sim_1"');
        expect(forms[0]).toContain('name="outcome" value="SETTLED"');
        expect(forms[0]).toContain(">Payer</button>");
        expect(forms[1]).toContain('name="outcome" value="FAILED"');
        expect(forms[1]).toContain(">Échouer</button>");
        // Chaque formulaire emporte l'adresse de retour : le POST la revérifie.
        expect(forms[0]).toContain(`name="returnUrl" value="${RETURN_URL}"`);
        expect(forms[1]).toContain(`name="returnUrl" value="${RETURN_URL}"`);
    });

    // La page est servie par l'API, sur l'origine qui porte la session : un paramètre rendu
    // tel quel y exécuterait le script de quiconque fabrique le lien.
    it("échappe tout ce que l'URL lui fait afficher", () => {
        const html = new SimulatorController(env(true)).page('sim_"><script>1</script>', {
            ...query,
            reference: "<script>alert(1)</script>",
            returnUrl: '"><script>alert(2)</script>',
        });

        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    });

    it("refuse un montant qui n'est pas un entier positif", () => {
        const controller = new SimulatorController(env(true));

        for (const amount of ["", "-5", "12.5", "abc", "1e3"]) {
            expect(() => controller.page("sim_1", { ...query, amount })).toThrow(
                expect.objectContaining({ message: ERROR_SIMULATOR_INPUT_INVALID }),
            );
        }
    });

    it("refuse une devise inconnue ou des paramètres absents", () => {
        const controller = new SimulatorController(env(true));

        expect(() => controller.page("sim_1", { ...query, currency: "ZZZ" })).toThrow(
            BadRequestException,
        );
        expect(() => controller.page("sim_1", undefined)).toThrow(BadRequestException);
        expect(() => controller.page("sim_1", { amount: ["1", "2"], currency: "EUR" })).toThrow(
            BadRequestException,
        );
    });

    it("n'existe pas quand le simulateur est éteint", () => {
        const controller = new SimulatorController(env(false));

        expect(() => controller.page("sim_1", query)).toThrow(NotFoundException);
        expect(() => controller.page("sim_1", query)).toThrow(
            expect.objectContaining({ message: ERROR_SIMULATOR_DISABLED }),
        );
    });
});

describe("SimulatorController.decide", () => {
    const body = { outcome: "SETTLED", returnUrl: RETURN_URL };

    it("n'existe pas quand le simulateur est éteint", async () => {
        const controller = new SimulatorController(env(false));

        await expect(controller.decide("sim_1", body)).rejects.toBeInstanceOf(NotFoundException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // Sans cette vérification la page est une redirection ouverte : une URL fabriquée
    // enverrait l'acheteur ailleurs depuis un domaine qu'il croit être le nôtre. Rien ne
    // doit être signé ni appelé avant elle.
    it.each([
        ["une autre origine", "http://ailleurs.test/fr/orders/CP-1"],
        ["une origine qui commence comme la vitrine", `${STOREFRONT}.ailleurs.test/fr/orders/CP-1`],
        ["la vitrine sans barre ensuite", STOREFRONT],
        ["une adresse à identifiants qui désigne un autre hôte", `${STOREFRONT}@ailleurs.test/`],
        ["un schéma qui n'est pas http", "javascript:alert(1)"],
        ["une adresse vide", ""],
    ])("refuse %s comme adresse de retour", async (_label, returnUrl) => {
        const controller = new SimulatorController(env(true));

        const attempt = controller.decide("sim_1", { outcome: "SETTLED", returnUrl });

        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toMatchObject({ message: ERROR_RETURN_URL_REFUSED });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuse une adresse de retour absente ou qui n'est pas une chaîne", async () => {
        const controller = new SimulatorController(env(true));

        await expect(controller.decide("sim_1", undefined)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            controller.decide("sim_1", { outcome: "SETTLED", returnUrl: ["a", "b"] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["PENDING", "REFUNDED", ""])("refuse l'issue %p", async (outcome) => {
        const controller = new SimulatorController(env(true));

        const attempt = controller.decide("sim_1", { outcome, returnUrl: RETURN_URL });

        await expect(attempt).rejects.toMatchObject({ message: ERROR_SIMULATOR_INPUT_INVALID });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // Le détour par son propre webhook est le but : la signature, la normalisation et
    // l'idempotence sont exercées comme elles le seront par un vrai fournisseur.
    it("appelle son propre webhook, avec un corps signé que l'adapter accepte", async () => {
        const controller = new SimulatorController(env(true));

        await controller.decide("sim_abc", body);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe("http://127.0.0.1:3003/payments/webhook/SIMULATED");
        expect(init?.method).toBe("POST");

        const raw = init?.body as string;
        const headers = init?.headers as Record<string, string>;
        // L'adapter réel relit ce que le simulateur vient d'émettre : c'est la preuve que
        // les deux moitiés s'accordent sur le corps ET sur la signature.
        expect(new SimulatedAdapter(SECRET, "http://api.test").interpret(raw, headers)).toEqual({
            providerRef: "sim_abc",
            status: "SETTLED",
        });
        expect(headers[SIGNATURE_HEADER]).toMatch(/^[0-9a-f]{64}$/u);
    });

    it("transmet l'échec choisi, et signe pour le secret du simulateur seulement", async () => {
        await new SimulatorController(env(true)).decide("sim_abc", {
            outcome: "FAILED",
            returnUrl: RETURN_URL,
        });

        const [, init] = fetchMock.mock.calls[0] ?? [];
        const raw = init?.body as string;
        const headers = init?.headers as Record<string, string>;
        expect(JSON.parse(raw)).toEqual({ providerRef: "sim_abc", status: "FAILED" });
        const otherAdapter = new SimulatedAdapter("autre-secret", "http://api.test");
        expect(otherAdapter.interpret(raw, headers)).toBeNull();
    });

    // 303 et non 302 : la redirection suit un POST, et 303 dit au navigateur de la suivre en GET.
    it("redirige en 303 vers l'adresse de retour", async () => {
        const answer = await new SimulatorController(env(true)).decide("sim_1", body);

        expect(answer).toEqual({ url: RETURN_URL, statusCode: 303 });
    });

    // Rediriger malgré un webhook refusé ramènerait l'acheteur sur une commande restée en
    // attente, sans rien dire de pourquoi.
    it("ne redirige pas quand son webhook a refusé l'événement", async () => {
        fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));

        const attempt = new SimulatorController(env(true)).decide("sim_1", body);

        await expect(attempt).rejects.toBeInstanceOf(BadGatewayException);
        await expect(attempt).rejects.toMatchObject({ message: ERROR_WEBHOOK_REFUSED });
    });

    it("laisse remonter une panne réseau", async () => {
        const outage = new TypeError("fetch failed");
        fetchMock.mockRejectedValue(outage);

        await expect(new SimulatorController(env(true)).decide("sim_1", body)).rejects.toBe(
            outage,
        );
    });
});
