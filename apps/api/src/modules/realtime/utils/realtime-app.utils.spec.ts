import { appForOrigin } from "./realtime-app.utils";

const ENV = {
    NEXT_PUBLIC_STOREFRONT_URL: "http://storefront.test",
    // Barre finale volontaire : l'adresse configurée est réduite à son origine, la forme
    // que le navigateur envoie.
    NEXT_PUBLIC_VENDOR_URL: "http://vendor.test/",
    NEXT_PUBLIC_ADMIN_URL: "http://admin.test",
};

describe("appForOrigin", () => {
    it("reconnaît la boutique", () => {
        expect(appForOrigin("http://storefront.test", ENV)).toBe("storefront");
    });

    it("reconnaît l'espace vendeur, quelle que soit la forme de l'adresse configurée", () => {
        expect(appForOrigin("http://vendor.test", ENV)).toBe("vendor");
    });

    // L'administration n'a pas de salle : la reconnaître ouvrirait une connexion que rien
    // n'alimente, ou pire, qu'on finirait par brancher sur une salle qui n'est pas la sienne.
    it("refuse l'administration", () => {
        expect(appForOrigin("http://admin.test", ENV)).toBeNull();
    });

    it("refuse une origine inconnue", () => {
        expect(appForOrigin("http://elsewhere.test", ENV)).toBeNull();
    });

    // Une égalité, jamais un préfixe : cette origine COMMENCE comme celle de la boutique.
    it("refuse une origine qui ne fait que commencer comme une origine connue", () => {
        expect(appForOrigin("http://storefront.test.elsewhere.test", ENV)).toBeNull();
    });

    it("refuse une poignée de main sans origine", () => {
        expect(appForOrigin(undefined, ENV)).toBeNull();
    });

    // Une variable absente ne doit pas faire de la chaîne vide une origine acceptée.
    it("ne reconnaît rien quand les adresses ne sont pas configurées", () => {
        expect(appForOrigin("", {})).toBeNull();
        expect(appForOrigin("http://storefront.test", {})).toBeNull();
    });
});
