import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMediaNotFound, readMedia, uploadMedia } from "./media-storage.utils.js";

// Ces fonctions parlent à un service réseau : ce qui se teste ICI, c'est leur REFUS de
// démarrer sans configuration — la classe de panne qui, sinon, se manifeste par une
// requête HTTP vers `undefined`. Le reste est éprouvé par la couche intégration de la
// tâche 5, contre le vrai conteneur de stockage.
describe("media-storage sans configuration", () => {
    const initial = { ...process.env };

    beforeEach(() => {
        process.env["STORAGE_URL"] = "http://storage:5000";
        process.env["STORAGE_SERVICE_KEY"] = "cle";
        delete process.env["STORAGE_MEDIA_BUCKET"];
    });

    afterEach(() => {
        process.env = { ...initial };
    });


    it("refuse de lire sans bucket déclaré", async () => {
        await expect(readMedia("a/b/w320.webp")).rejects.toThrow(/STORAGE_MEDIA_BUCKET/);
    });

    it("refuse de déposer sans bucket déclaré", async () => {
        await expect(uploadMedia("a/b/w320.webp", new ArrayBuffer(4), "image/webp")).rejects.toThrow(
            /STORAGE_MEDIA_BUCKET/,
        );
    });

    // Le nom de la variable manquante doit apparaître : un `undefined` qui voyage
    // explose trois écrans plus loin, loin de sa cause.
    it("nomme l'URL de stockage quand c'est elle qui manque", async () => {
        process.env["STORAGE_MEDIA_BUCKET"] = "product-media";
        delete process.env["STORAGE_URL"];
        await expect(readMedia("a/b/w320.webp")).rejects.toThrow(/STORAGE_URL/);
    });
});

// Le client de stockage lève pour TOUT : objet absent, mais aussi 5xx, expiration et
// coupure réseau. Les confondre condamne une image pour une panne de quelques secondes,
// alors que son original est toujours là. Voici la forme exacte d'un objet absent, relevée
// contre le conteneur `supabase/storage-api` le 2026-09-24 — noter que `status` vaut 400
// et que c'est `statusCode` qui porte le 404.
const OBJET_ABSENT = Object.assign(new Error("Object not found"), {
    name: "StorageApiError",
    status: 400,
    statusCode: "404",
    code: "NoSuchKey",
});

describe("isMediaNotFound", () => {
    it("reconnaît l'objet absent tel que le stockage le rend", () => {
        expect(isMediaNotFound(OBJET_ABSENT)).toBe(true);
    });

    it("reconnaît un 404 numérique aussi", () => {
        expect(isMediaNotFound({ statusCode: 404 })).toBe(true);
    });

    // LE cas qui motive la fonction : une panne passagère ne doit pas être prise pour une
    // absence, sinon le job ne retente jamais et l'image est condamnée.
    it("refuse une panne passagère du stockage", () => {
        expect(isMediaNotFound({ statusCode: "500", code: "InternalError" })).toBe(false);
        expect(isMediaNotFound({ statusCode: "503" })).toBe(false);
    });

    it("refuse une coupure réseau, qui ne porte aucun statut", () => {
        expect(isMediaNotFound(Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }))).toBe(
            false,
        );
        expect(isMediaNotFound(new Error("socket hang up"))).toBe(false);
    });

    it("refuse ce qui n'est pas un objet", () => {
        expect(isMediaNotFound(null)).toBe(false);
        expect(isMediaNotFound(undefined)).toBe(false);
        expect(isMediaNotFound("404")).toBe(false);
    });
});
