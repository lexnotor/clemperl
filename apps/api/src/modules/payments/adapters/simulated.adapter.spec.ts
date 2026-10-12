import {
    SIGNATURE_HEADER,
    SIMULATED_PROVIDER,
    SimulatedAdapter,
    signSimulatedPayload,
} from "./simulated.adapter";

const SECRET = "secret-de-test";
const adapter = new SimulatedAdapter(SECRET, "http://localhost:3003");

const signed = (body: unknown) => {
    const raw = JSON.stringify(body);
    return { raw, headers: { [SIGNATURE_HEADER]: signSimulatedPayload(SECRET, raw) } };
};

describe("SimulatedAdapter", () => {
    // Le nom est persisté avec chaque paiement en ligne : le changer laisserait les lignes
    // existantes sous un fournisseur que plus rien ne sait servir.
    it("se déclare sous le nom SIMULATED", () => {
        expect(adapter.provider).toBe(SIMULATED_PROVIDER);
        expect(SIMULATED_PROVIDER).toBe("SIMULATED");
    });

    it("rend une URL qui porte la référence et le retour", async () => {
        const started = await adapter.start({
            orderId: "o1",
            reference: "CMD-2026-ABCDEF",
            amount: 4500,
            currency: "EUR",
            returnUrl: "http://localhost:3000/fr/orders/CMD-2026-ABCDEF",
        });
        expect(started.providerRef).toMatch(/^sim_/u);
        expect(started.redirectUrl).toContain(started.providerRef);
        expect(started.redirectUrl).toContain("returnUrl=");
    });

    it("tire une référence différente à chaque démarrage", async () => {
        const input = {
            orderId: "o1",
            reference: "CMD-2026-ABCDEF",
            amount: 4500,
            currency: "EUR",
            returnUrl: "http://localhost:3000/fr/orders/CMD-2026-ABCDEF",
        };
        const first = await adapter.start(input);
        const second = await adapter.start(input);
        expect(first.providerRef).not.toBe(second.providerRef);
    });

    it("interprète un corps correctement signé", () => {
        const { raw, headers } = signed({ providerRef: "sim_1", status: "SETTLED" });
        expect(adapter.interpret(raw, headers)).toEqual({
            providerRef: "sim_1",
            status: "SETTLED",
        });
    });

    it("rend null sur une signature fausse", () => {
        const { raw } = signed({ providerRef: "sim_1", status: "SETTLED" });
        expect(adapter.interpret(raw, { [SIGNATURE_HEADER]: "00".repeat(32) })).toBeNull();
    });

    it("rend null sur une signature de longueur différente", () => {
        const { raw } = signed({ providerRef: "sim_1", status: "SETTLED" });
        expect(adapter.interpret(raw, { [SIGNATURE_HEADER]: "abc" })).toBeNull();
    });

    // Une signature de 64 caractères mais de plus de 64 octets : `timingSafeEqual` lève sur
    // deux tampons de longueurs différentes, et l'en-tête est une entrée publique. La
    // longueur se compare donc en octets, pas en caractères.
    it("rend null, sans lever, sur une signature de 64 caractères mais pas de 64 octets", () => {
        const { raw } = signed({ providerRef: "sim_1", status: "SETTLED" });
        const received = "é".repeat(64);
        expect(() => adapter.interpret(raw, { [SIGNATURE_HEADER]: received })).not.toThrow();
        expect(adapter.interpret(raw, { [SIGNATURE_HEADER]: received })).toBeNull();
    });

    it("rend null sans en-tête de signature", () => {
        const { raw } = signed({ providerRef: "sim_1", status: "SETTLED" });
        expect(adapter.interpret(raw, {})).toBeNull();
    });

    // La signature protège le corps ENTIER : un corps modifié après signature ne passe
    // plus, et c'est ce que le fournisseur réel fera aussi.
    it("rend null quand le corps a changé après signature", () => {
        const { headers } = signed({ providerRef: "sim_1", status: "SETTLED" });
        const altered = JSON.stringify({ providerRef: "sim_2", status: "SETTLED" });
        expect(adapter.interpret(altered, headers)).toBeNull();
    });

    it("rend null sur un corps tronqué", () => {
        const raw = '{"providerRef":"sim_1"';
        const headers = { [SIGNATURE_HEADER]: signSimulatedPayload(SECRET, raw) };
        expect(adapter.interpret(raw, headers)).toBeNull();
    });

    // Un corps signé mais incomplet ou mal typé est un cas ordinaire : un fournisseur
    // change son format, et la plateforme doit refuser plutôt qu'écrire n'importe quoi.
    it("rend null quand les champs manquent ou sont mal typés", () => {
        for (const body of [
            { status: "SETTLED" },
            { providerRef: "sim_1" },
            { providerRef: "", status: "SETTLED" },
            { providerRef: "sim_1", status: "REMBOURSE" },
            { providerRef: 42, status: "SETTLED" },
            [],
            null,
        ]) {
            const { raw, headers } = signed(body);
            expect(adapter.interpret(raw, headers)).toBeNull();
        }
    });
});
