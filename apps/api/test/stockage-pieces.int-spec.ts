import {
    construireCheminObjet,
    lirePiece,
    supprimerPieces,
    televerserPiece,
} from "@clemperl/core";

// Éprouve le vrai service de stockage, pas un substitut : c'est toute la raison de le
// faire tourner en développement. Un simulacre ne dirait rien des politiques de bucket
// ni des erreurs réelles du client.
describe("stockage des pièces justificatives", () => {
    const prefixe = `integration-${Date.now()}`;

    it("téléverse une pièce puis la relit à l'identique", async () => {
        const chemin = construireCheminObjet(prefixe, "REGISTRY", "rccm.pdf");
        const contenu = new TextEncoder().encode("registre de commerce").buffer;

        await televerserPiece(chemin, contenu as ArrayBuffer, "application/pdf");

        const relue = await lirePiece(chemin);
        expect(await relue.text()).toBe("registre de commerce");
    });

    it("refuse d'écraser un objet existant", async () => {
        const chemin = construireCheminObjet(prefixe, "IDENTITY", "carte.png");
        const contenu = new TextEncoder().encode("premier").buffer as ArrayBuffer;
        await televerserPiece(chemin, contenu, "image/png");

        // Sans ce refus, une resoumission pourrait remplacer une pièce avant que la
        // transaction ne soit validée, et un échec laisserait le dossier pointant vers
        // un fichier déjà écrasé.
        await expect(televerserPiece(chemin, contenu, "image/png")).rejects.toBeDefined();
    });

    it("supprime les pièces demandées et laisse les autres", async () => {
        const garde = construireCheminObjet(prefixe, "TAX", "garde.pdf");
        const jete = construireCheminObjet(prefixe, "TAX", "jete.pdf");
        const contenu = new TextEncoder().encode("x").buffer as ArrayBuffer;
        await televerserPiece(garde, contenu, "application/pdf");
        await televerserPiece(jete, contenu, "application/pdf");

        await supprimerPieces([jete]);

        await expect(lirePiece(jete)).rejects.toBeDefined();
        await expect(lirePiece(garde)).resolves.toBeDefined();
    });

    it("ne lève pas quand le ménage porte sur un objet absent", async () => {
        await expect(supprimerPieces(["inexistant/nulle-part.pdf"])).resolves.toBeUndefined();
    });
});
