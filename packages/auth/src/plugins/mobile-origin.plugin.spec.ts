import { describe, expect, it } from "vitest";
import { mobileOriginPlugin } from "./mobile-origin.plugin.js";

const signIn = (headers: Record<string, string>) =>
    new Request("http://boutique.test/api/auth/sign-in/email", { method: "POST", headers });

const run = (request: Request) => mobileOriginPlugin({ NODE_ENV: "development" }).onRequest(request);

describe("mobileOriginPlugin", () => {
    it("recopie expo-origin en Origin quand la requête n'en porte pas", async () => {
        const result = await run(signIn({ "expo-origin": "exp://192.0.2.20:8081" }));

        expect(result?.request.headers.get("origin")).toBe("exp://192.0.2.20:8081");
    });

    // Un navigateur envoie toujours son origine : la remplacer par un en-tête que n'importe
    // quelle page peut poser défairait le contrôle des origines pour tous les fronts.
    it("ne touche pas une requête qui porte déjà une origine", async () => {
        const request = signIn({ origin: "http://boutique.test", "expo-origin": "exp://x" });

        expect(await run(request)).toBeUndefined();
        expect(request.headers.get("origin")).toBe("http://boutique.test");
    });

    it("laisse passer une requête sans expo-origin", async () => {
        expect(await run(signIn({}))).toBeUndefined();
    });

    it("recopie aussi l'origine quand les en-têtes de la requête sont figés", async () => {
        const request = signIn({ "expo-origin": "clemperl-vendor://" });
        Object.defineProperty(request.headers, "set", {
            value: () => {
                throw new TypeError("immutable");
            },
        });

        const result = await run(request);

        expect(result?.request.headers.get("origin")).toBe("clemperl-vendor://");
    });

    it("fait confiance à Expo Go en développement seulement", () => {
        const trusted = (env: NodeJS.ProcessEnv) =>
            mobileOriginPlugin(env).init().options.trustedOrigins;

        expect(trusted({ NODE_ENV: "development" })).toEqual(["exp://"]);
        expect(trusted({ NODE_ENV: "production" })).toEqual([]);
        expect(trusted({ NODE_ENV: "test" })).toEqual([]);
    });
});
