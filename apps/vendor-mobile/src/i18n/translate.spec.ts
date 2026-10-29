import { translate } from "./translate";

describe("translate", () => {
    it("rend la phrase de la langue demandée", () => {
        expect(translate("fr", "signIn.submit")).toBe("Se connecter");
        expect(translate("en", "signIn.submit")).toBe("Sign in");
    });

    it("remplace un argument nommé", () => {
        expect(translate("fr", "home.signedInAs", { email: "awa@atelier.test" })).toBe(
            "Connecté en tant que awa@atelier.test",
        );
    });
});
