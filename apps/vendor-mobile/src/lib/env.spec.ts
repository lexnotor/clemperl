import { readEnv } from "./env";

const complete = {
    EXPO_PUBLIC_API_URL: "http://192.0.2.10:3003/",
    EXPO_PUBLIC_STOREFRONT_URL: "http://192.0.2.10:3000",
};

describe("readEnv", () => {
    it("rend les deux adresses, sans barre finale", () => {
        expect(readEnv(complete)).toEqual({
            apiUrl: "http://192.0.2.10:3003",
            storefrontUrl: "http://192.0.2.10:3000",
        });
    });

    // Sans ce refus, la première requête partirait vers `undefined/graphql`, et l'écran dirait
    // ClemPerl injoignable au lieu de nommer le réglage oublié.
    it("nomme la variable absente", () => {
        expect(() => readEnv({ ...complete, EXPO_PUBLIC_API_URL: undefined })).toThrow(
            "EXPO_PUBLIC_API_URL",
        );
        expect(() => readEnv({ ...complete, EXPO_PUBLIC_STOREFRONT_URL: "" })).toThrow(
            "EXPO_PUBLIC_STOREFRONT_URL",
        );
    });
});
