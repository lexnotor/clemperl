import { randomBytes } from "node:crypto";
import { decryptPayload, encryptPayload, readPayloadKey } from "./payload-cipher";

const KEY = randomBytes(32);

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
