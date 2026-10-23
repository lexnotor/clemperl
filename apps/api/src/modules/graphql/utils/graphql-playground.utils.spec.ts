import { graphqlLandingPagePlugins, graphqlPlaygroundEnabled } from "./graphql-playground.utils";

describe("graphqlPlaygroundEnabled", () => {
    it("allume le terrain de jeu hors production", () => {
        expect(graphqlPlaygroundEnabled({ NODE_ENV: "development" })).toBe(true);
        // Le pilote Apollo l'allume aussi sans `NODE_ENV` : les deux lectures disent la même
        // chose.
        expect(graphqlPlaygroundEnabled({})).toBe(true);
    });

    it("l'éteint en production", () => {
        expect(graphqlPlaygroundEnabled({ NODE_ENV: "production" })).toBe(false);
    });
});

// La page que le plugin servirait sur `GET /graphql`, telle qu'Apollo la rend.
async function landingPageHtml(env: NodeJS.ProcessEnv): Promise<string> {
    const [plugin] = graphqlLandingPagePlugins(env) as {
        serverWillStart: () => Promise<{ renderLandingPage: () => Promise<{ html: () => Promise<string> }> }>;
    }[];
    const listener = await plugin!.serverWillStart();
    const page = await listener.renderLandingPage();
    return page.html();
}

describe("graphqlLandingPagePlugins", () => {
    // Aucune page : le pilote pose alors le marqueur qui éteint celle d'Apollo par défaut.
    it("ne sert aucune page en production", () => {
        expect(graphqlLandingPagePlugins({ NODE_ENV: "production" })).toEqual([]);
    });

    it("sert Apollo Sandbox hors production", async () => {
        expect(graphqlLandingPagePlugins({ NODE_ENV: "development" })).toHaveLength(1);
        expect(await landingPageHtml({ NODE_ENV: "development" })).toContain("embeddableSandbox");
    });

    // Sans les cookies, `me` répondrait `UNAUTHENTICATED` à un vendeur pourtant connecté sur
    // la boutique.
    it("envoie les cookies de la session", async () => {
        expect(await landingPageHtml({ NODE_ENV: "development" })).toContain('"includeCookies":true');
    });

    it("n'envoie aucune télémétrie à Apollo", async () => {
        expect(await landingPageHtml({ NODE_ENV: "development" })).toContain('"runTelemetry":false');
    });
});
