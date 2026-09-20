import { buildObjectPath, deleteDocuments, readDocument, uploadDocument } from "@clemperl/core";

// Éprouve le vrai service de stockage, pas un substitut : c'est toute la raison de le
// faire tourner en développement. Un simulacre ne dirait rien des politiques de bucket
// ni des erreurs réelles du client.
describe("stockage des pièces justificatives", () => {
    const prefix = `integration-${Date.now()}`;

    it("téléverse une pièce puis la relit à l'identique", async () => {
        const path = buildObjectPath(prefix, "REGISTRY", "rccm.pdf");
        const content = new TextEncoder().encode("registre de commerce").buffer as ArrayBuffer;

        await uploadDocument(path, content, "application/pdf");

        const readBack = await readDocument(path);
        expect(await readBack.text()).toBe("registre de commerce");
    });

    it("refuse d'écraser un objet existant", async () => {
        const path = buildObjectPath(prefix, "IDENTITY", "carte.png");
        const content = new TextEncoder().encode("premier").buffer as ArrayBuffer;
        await uploadDocument(path, content, "image/png");

        // Sans ce refus, une resoumission pourrait remplacer une pièce avant que la
        // transaction ne soit validée, et un échec laisserait le dossier pointant vers
        // un fichier déjà écrasé.
        await expect(uploadDocument(path, content, "image/png")).rejects.toBeDefined();
    });

    it("supprime les pièces demandées et laisse les autres", async () => {
        const kept = buildObjectPath(prefix, "TAX", "garde.pdf");
        const removed = buildObjectPath(prefix, "TAX", "jete.pdf");
        const content = new TextEncoder().encode("x").buffer as ArrayBuffer;
        await uploadDocument(kept, content, "application/pdf");
        await uploadDocument(removed, content, "application/pdf");

        await deleteDocuments([removed]);

        await expect(readDocument(removed)).rejects.toBeDefined();
        await expect(readDocument(kept)).resolves.toBeDefined();
    });

    it("ne lève pas quand le ménage porte sur un objet absent", async () => {
        await expect(deleteDocuments(["inexistant/nulle-part.pdf"])).resolves.toBeUndefined();
    });
});
