import { createMobileAuthClient } from "./auth-client";

// Hors d'Expo Go, `expo-linking` n'a pas de manifeste pour construire une adresse. Celle-ci suit
// le schéma qu'on lui passe, comme le ferait une version construite de l'application.
jest.mock("expo-linking", () => ({
    ...jest.requireActual("expo-linking"),
    createURL: (path: string, options?: { scheme?: string }) => `${options?.scheme ?? "exp"}://${path}`,
}));

// Le jumeau de `mobileOriginPlugin`, dans `packages/auth` : le serveur lit `expo-origin` parce
// que ce client l'envoie. Ce test tient le contrat de ce côté-ci, l'e2e
// `apps/api/test/mobile-session.e2e-spec.ts` de l'autre.
describe("createMobileAuthClient", () => {
    it("se connecte à la boutique en annonçant son origine dans expo-origin", async () => {
        const fetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
            async () =>
                new Response(JSON.stringify({ token: "t", user: { id: "u1" } }), {
                    headers: { "Content-Type": "application/json" },
                }),
        );
        const client = createMobileAuthClient("http://192.0.2.10:3000", fetch as never);

        await client.signIn.email({ email: "awa@atelier.test", password: "motdepasse123" });

        const [url, init] = fetch.mock.calls[0]!;
        expect(String(url)).toBe("http://192.0.2.10:3000/api/auth/sign-in/email");
        const headers = new Headers(init?.headers);
        expect(headers.get("expo-origin")).toBe("clemperl-vendor://");
        expect(headers.get("origin")).toBeNull();
    });
});
