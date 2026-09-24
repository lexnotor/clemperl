import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readMedia, uploadMedia } from "./media-storage.utils.js";

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
