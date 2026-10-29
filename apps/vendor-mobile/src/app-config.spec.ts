import appJson from "../app.json";

// Le schéma d'adresse est écrit deux fois, et ce test tient l'un d'accord avec l'autre : ici,
// dans `app.json`, et côté serveur dans les `trustedOrigins` de `packages/auth`
// (`clemperl-vendor://`). Un schéma changé d'un seul côté ferait refuser la connexion de toute
// version construite de l'application.
describe("la configuration d'Expo", () => {
    it("déclare le schéma d'adresse que le serveur reconnaît", () => {
        expect(appJson.expo.scheme).toBe("clemperl-vendor");
        expect(appJson.expo.slug).toBe("clemperl-vendor");
    });
});
