import { StorageClient } from "@supabase/storage-js";

// Construit à la demande et non à l'import : charger ce module dans un contexte sans
// variables d'environnement — un test unitaire, une étape de build — ne doit pas échouer.
function client(): StorageClient {
    const url = process.env["STORAGE_URL"];
    const cle = process.env["STORAGE_SERVICE_KEY"];
    if (!url || !cle) {
        throw new Error("STORAGE_URL ou STORAGE_SERVICE_KEY est absente.");
    }
    return new StorageClient(url, { Authorization: `Bearer ${cle}` });
}

function seau(): string {
    const nom = process.env["STORAGE_BUCKET"];
    if (!nom) {
        throw new Error("STORAGE_BUCKET est absente.");
    }
    return nom;
}

export async function televerserPiece(
    chemin: string,
    contenu: ArrayBuffer,
    mimeType: string,
): Promise<void> {
    const { error } = await client()
        .from(seau())
        .upload(chemin, contenu, { contentType: mimeType, upsert: false });
    if (error) {
        throw error;
    }
}

export async function lirePiece(chemin: string): Promise<Blob> {
    const { data, error } = await client().from(seau()).download(chemin);
    if (error || !data) {
        throw error ?? new Error(`Pièce introuvable : ${chemin}`);
    }
    return data;
}

// Appelée en compensation après l'échec d'une écriture, et pour retirer les anciens
// objets après le commit d'une resoumission. Elle n'échoue jamais bruyamment : un objet
// orphelin coûte de l'espace, et faire échouer un dépôt réussi parce qu'un ménage a raté
// serait une régression.
export async function supprimerPieces(chemins: readonly string[]): Promise<void> {
    if (chemins.length === 0) {
        return;
    }
    try {
        await client().from(seau()).remove([...chemins]);
    } catch (erreur) {
        console.error("Suppression de pièces impossible", { chemins, erreur });
    }
}
