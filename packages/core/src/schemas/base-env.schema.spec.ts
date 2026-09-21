import { describe, expect, it } from "vitest";
import { parseBaseEnv } from "./base-env.schema.js";

const VALIDE = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db:5432/x",
    REDIS_URL: "redis://redis:6379",
    DEV_HOST: "10-0-0-1.sslip.io",
    BETTER_AUTH_SECRET: "a".repeat(32),
    SMTP_URL: "smtp://mailpit:1025",
    EMAIL_FROM: "ClemPerl <a@b.test>",
    STORAGE_URL: "https://stockage.exemple.test",
    STORAGE_SERVICE_KEY: "cle",
    STORAGE_BUCKET: "vendor-documents",
};

describe("environnement de base", () => {
    it("accepte une configuration complète", () => {
        expect(parseBaseEnv(VALIDE).STORAGE_BUCKET).toBe("vendor-documents");
    });

    // Le message doit NOMMER la variable : un `undefined` qui voyage explose trois écrans
    // plus loin, loin de sa cause.
    it("nomme la variable absente dans l'erreur", () => {
        const sansCle = { ...VALIDE, STORAGE_SERVICE_KEY: undefined };
        expect(() => parseBaseEnv(sansCle)).toThrow(/STORAGE_SERVICE_KEY/);
    });

    // La clé de service voyage dans un en-tête `Authorization` à chaque requête : en clair
    // sur le réseau, elle est lisible par qui écoute, et avec elle tous les justificatifs.
    it("refuse un stockage en clair hors développement", () => {
        expect(() => parseBaseEnv({ ...VALIDE, STORAGE_URL: "http://stockage.test" })).toThrow(
            /STORAGE_URL/,
        );
    });

    it("tolère le clair en développement, où le service vit sur le réseau Docker", () => {
        expect(
            parseBaseEnv({
                ...VALIDE,
                NODE_ENV: "development",
                STORAGE_URL: "http://storage:5000",
            }).STORAGE_URL,
        ).toBe("http://storage:5000");
    });

    // La stack e2e monte un build de PRODUCTION contre un stockage sur le réseau Docker :
    // le cas que `development` couvrait, sous un autre `NODE_ENV`. Le drapeau est la
    // seule façon de le dire, et il doit rester la seule.
    it("tolère le clair en production quand STORAGE_ALLOW_PLAINTEXT vaut 1", () => {
        expect(
            parseBaseEnv({
                ...VALIDE,
                STORAGE_URL: "http://storage:5000",
                STORAGE_ALLOW_PLAINTEXT: "1",
            }).STORAGE_URL,
        ).toBe("http://storage:5000");
    });

    // Une valeur approchante ne suffit pas : lever une garantie se fait exactement, ou
    // pas du tout.
    it("refuse le clair pour toute autre valeur du drapeau", () => {
        expect(() =>
            parseBaseEnv({
                ...VALIDE,
                STORAGE_URL: "http://storage:5000",
                STORAGE_ALLOW_PLAINTEXT: "true",
            }),
        ).toThrow(/STORAGE_ALLOW_PLAINTEXT/);
    });
});
