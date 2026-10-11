import { allowedOrigins, readPaymentsEnv } from "./payments-env.utils";

// 32 octets, encodés en base64 : la forme que `openssl rand -base64 32` produit.
const KEY = Buffer.alloc(32, 7).toString("base64");

// Un environnement complet et valide. Chaque test n'en change QU'UNE variable : un refus
// ne peut alors venir que de celle-là.
const complete = (): NodeJS.ProcessEnv => ({
    PAYMENT_PAYLOAD_KEY: KEY,
    PAYMENT_SIMULATOR: "1",
    PAYMENT_SIMULATOR_SECRET: "secret",
    NEXT_PUBLIC_API_URL: "http://localhost:3003",
    NEXT_PUBLIC_STOREFRONT_URL: "http://localhost:3000",
});

describe("readPaymentsEnv", () => {
    it("lit un environnement complet", () => {
        const env = readPaymentsEnv(complete());

        expect(env.payloadKey.equals(Buffer.alloc(32, 7))).toBe(true);
        expect(env.simulator).toBe(true);
        expect(env.simulatorSecret).toBe("secret");
        expect(env.apiPublicUrl).toBe("http://localhost:3003");
        expect(env.storefrontUrl).toBe("http://localhost:3000");
    });

    // Le démarrage s'arrête avec le NOM de la variable : une clé absente découverte au
    // premier webhook, des heures plus tard, ne dirait rien de sa cause.
    it("refuse de démarrer sans clé de chiffrement, en la nommant", () => {
        const env = complete();
        delete env["PAYMENT_PAYLOAD_KEY"];

        expect(() => readPaymentsEnv(env)).toThrow(/PAYMENT_PAYLOAD_KEY/);
    });

    it("refuse une clé qui ne fait pas 32 octets", () => {
        const env = { ...complete(), PAYMENT_PAYLOAD_KEY: Buffer.alloc(16).toString("base64") };

        expect(() => readPaymentsEnv(env)).toThrow(/PAYMENT_PAYLOAD_KEY/);
    });

    // `buildRegistry` accepte un secret vide : seul ce lecteur peut le refuser. Un
    // simulateur qui signe avec une clé vide signerait pour n'importe qui.
    it("refuse un simulateur sans secret", () => {
        expect(() =>
            readPaymentsEnv({ ...complete(), PAYMENT_SIMULATOR_SECRET: "" }),
        ).toThrow(/PAYMENT_SIMULATOR_SECRET/);

        const env = complete();
        delete env["PAYMENT_SIMULATOR_SECRET"];
        expect(() => readPaymentsEnv(env)).toThrow(/PAYMENT_SIMULATOR_SECRET/);
    });

    it("n'exige aucun secret quand le simulateur est éteint", () => {
        const env = complete();
        delete env["PAYMENT_SIMULATOR_SECRET"];

        const read = readPaymentsEnv({ ...env, PAYMENT_SIMULATOR: "0" });

        expect(read.simulator).toBe(false);
        expect(read.simulatorSecret).toBe("");
    });

    it("tient le simulateur pour éteint quand la variable est absente", () => {
        const env = complete();
        delete env["PAYMENT_SIMULATOR"];

        expect(readPaymentsEnv(env).simulator).toBe(false);
    });

    it("refuse de démarrer sans l'adresse publique de l'API", () => {
        expect(() => readPaymentsEnv({ ...complete(), NEXT_PUBLIC_API_URL: "" })).toThrow(
            /NEXT_PUBLIC_API_URL/,
        );

        const env = complete();
        delete env["NEXT_PUBLIC_API_URL"];
        expect(() => readPaymentsEnv(env)).toThrow(/NEXT_PUBLIC_API_URL/);
    });

    // `.env.example` livre le simulateur allumé, avec un secret public : en production, il
    // laisserait un acheteur régler sa commande sans payer, et quiconque connaît le secret
    // par défaut forgerait des webhooks. Le secret de `complete()` est rempli : seul le
    // simulateur en production peut faire refuser cet environnement.
    it("refuse de démarrer avec le simulateur allumé en production, en le nommant", () => {
        expect(() => readPaymentsEnv({ ...complete(), NODE_ENV: "production" })).toThrow(
            /PAYMENT_SIMULATOR est allumé/,
        );
    });

    it("accepte la production quand le simulateur est éteint", () => {
        const env = readPaymentsEnv({
            ...complete(),
            NODE_ENV: "production",
            PAYMENT_SIMULATOR: "0",
        });

        expect(env.simulator).toBe(false);
    });

    it("accepte le simulateur allumé en développement", () => {
        expect(readPaymentsEnv({ ...complete(), NODE_ENV: "development" }).simulator).toBe(true);
    });

    // Une barre finale ne se retrouverait dans aucun `Origin`, et ferait refuser tout retour
    // d'acheteur (`//` ne commence pas par `/`) sans dire pourquoi.
    it("réduit les adresses à leur origine", () => {
        const env = readPaymentsEnv({
            ...complete(),
            NEXT_PUBLIC_API_URL: "http://localhost:3003/",
            NEXT_PUBLIC_STOREFRONT_URL: "https://clemperl.test:443/fr?x=1",
        });

        expect(env.apiPublicUrl).toBe("http://localhost:3003");
        expect(env.storefrontUrl).toBe("https://clemperl.test");
    });

    it("refuse une adresse qui n'est pas une URL, en nommant la variable", () => {
        expect(() =>
            readPaymentsEnv({ ...complete(), NEXT_PUBLIC_STOREFRONT_URL: "pas une url" }),
        ).toThrow(/NEXT_PUBLIC_STOREFRONT_URL/);
    });

    // `new URL("localhost:3000")` réussit, avec `localhost:` pour schéma : l'oubli du
    // `http://` ne doit pas passer pour une adresse.
    it("refuse une adresse sans schéma http ou https", () => {
        expect(() =>
            readPaymentsEnv({ ...complete(), NEXT_PUBLIC_API_URL: "localhost:3003" }),
        ).toThrow(/NEXT_PUBLIC_API_URL doit commencer par http/);
    });

    it("refuse de démarrer sans l'adresse de la vitrine", () => {
        const env = complete();
        delete env["NEXT_PUBLIC_STOREFRONT_URL"];

        expect(() => readPaymentsEnv(env)).toThrow(/NEXT_PUBLIC_STOREFRONT_URL/);
    });
});

describe("allowedOrigins", () => {
    it("rend les origines des trois fronts, dans l'ordre", () => {
        expect(
            allowedOrigins({
                NEXT_PUBLIC_STOREFRONT_URL: "http://localhost:3000",
                NEXT_PUBLIC_VENDOR_URL: "http://localhost:3001",
                NEXT_PUBLIC_ADMIN_URL: "http://localhost:3002",
            }),
        ).toEqual(["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]);
    });

    it("réduit chaque origine : sans barre finale, sans port par défaut, sans chemin", () => {
        expect(
            allowedOrigins({
                NEXT_PUBLIC_STOREFRONT_URL: "http://localhost:3000/",
                NEXT_PUBLIC_VENDOR_URL: "https://vendor.clemperl.test:443",
                NEXT_PUBLIC_ADMIN_URL: "https://admin.clemperl.test/tableau",
            }),
        ).toEqual([
            "http://localhost:3000",
            "https://vendor.clemperl.test",
            "https://admin.clemperl.test",
        ]);
    });

    it("refuse une origine mal écrite, en nommant la variable", () => {
        expect(() => allowedOrigins({ NEXT_PUBLIC_VENDOR_URL: "localhost:3001" })).toThrow(
            /NEXT_PUBLIC_VENDOR_URL/,
        );
        expect(() => allowedOrigins({ NEXT_PUBLIC_ADMIN_URL: "n'importe quoi" })).toThrow(
            /NEXT_PUBLIC_ADMIN_URL/,
        );
    });

    // Une variable vide ne désigne aucune origine : elle n'a pas à figurer dans la liste.
    it("écarte les variables vides ou absentes", () => {
        expect(
            allowedOrigins({
                NEXT_PUBLIC_STOREFRONT_URL: "http://localhost:3000",
                NEXT_PUBLIC_VENDOR_URL: "",
            }),
        ).toEqual(["http://localhost:3000"]);
    });
});
