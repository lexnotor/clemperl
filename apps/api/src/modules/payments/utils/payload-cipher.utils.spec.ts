import { randomBytes } from "node:crypto";
import { decryptPayload, encryptPayload, readPayloadKey } from "./payload-cipher.utils";

const KEY = randomBytes(32);
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

describe("payload-cipher", () => {
    it("rend en clair ce qu'il a chiffré", () => {
        const clear = JSON.stringify({ providerRef: "sim_1", status: "SETTLED" });
        expect(decryptPayload(KEY, encryptPayload(KEY, clear))).toBe(clear);
    });

    it("chiffre deux fois le même clair en deux chiffrés différents", () => {
        const a = encryptPayload(KEY, "bonjour");
        const b = encryptPayload(KEY, "bonjour");
        expect(a.equals(b)).toBe(false);
    });

    // GCM et non CBC : le sceau fait ÉCHOUER le déchiffrement d'un payload altéré, au lieu
    // de rendre des octets qui ressemblent à du JSON.
    it("refuse un chiffré altéré d'un seul octet", () => {
        const stored = encryptPayload(KEY, "bonjour");
        const altered = Buffer.from(stored);
        altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 0x01;
        expect(() => decryptPayload(KEY, altered)).toThrow();
    });

    // Le sceau suit l'IV, et son dernier octet est celui qu'une vérification d'un sceau
    // raccourci ignorerait.
    it("refuse un sceau altéré d'un seul octet", () => {
        const stored = encryptPayload(KEY, "bonjour");
        const altered = Buffer.from(stored);
        const last = IV_LENGTH + TAG_LENGTH - 1;
        altered[last] = (altered[last] ?? 0) ^ 0x01;
        expect(() => decryptPayload(KEY, altered)).toThrow();
    });

    // Un tampon coupé dans le sceau garde un chiffré intact (ici vide) et un sceau plus
    // court. Sans longueur de sceau imposée, GCM accepte ceux de 4, 8 et 12 à 15 octets :
    // le déchiffrement passerait avec une garantie d'intégrité affaiblie.
    it("refuse un tampon stocké dont le sceau est tronqué", () => {
        const stored = encryptPayload(KEY, "");
        for (const tagLength of [4, 8, 12, 15]) {
            const truncated = stored.subarray(0, IV_LENGTH + tagLength);
            expect(() => decryptPayload(KEY, truncated)).toThrow();
        }
    });

    it("refuse une autre clé", () => {
        const stored = encryptPayload(KEY, "bonjour");
        expect(() => decryptPayload(randomBytes(32), stored)).toThrow();
    });

    it("refuse une clé qui n'est pas de 32 octets", () => {
        expect(() => readPayloadKey(randomBytes(16).toString("base64"))).toThrow();
        expect(() => readPayloadKey(undefined)).toThrow();
    });

    it("lit une clé de 32 octets en base64", () => {
        expect(readPayloadKey(KEY.toString("base64")).equals(KEY)).toBe(true);
    });
});
