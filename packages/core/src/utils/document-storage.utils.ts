import { storageClient as client } from "./storage-client.utils.js";

function bucket(): string {
    const name = process.env["STORAGE_BUCKET"];
    if (!name) {
        throw new Error("STORAGE_BUCKET est absente.");
    }
    return name;
}

export async function uploadDocument(
    path: string,
    content: ArrayBuffer,
    mimeType: string,
): Promise<void> {
    const { error } = await client()
        .from(bucket())
        .upload(path, content, { contentType: mimeType, upsert: false });
    if (error) {
        throw error;
    }
}

export async function readDocument(path: string): Promise<Blob> {
    const { data, error } = await client().from(bucket()).download(path);
    if (error || !data) {
        throw error ?? new Error(`Pièce introuvable : ${path}`);
    }
    return data;
}

// Appelée en compensation après l'échec d'une écriture, et pour retirer les anciens
// objets après le commit d'une resoumission. Elle n'échoue jamais bruyamment : un objet
// orphelin coûte de l'espace, et faire échouer un dépôt réussi parce qu'un ménage a raté
// serait une régression.
export async function deleteDocuments(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
        return;
    }
    // Le client RENVOIE son erreur au lieu de la lever : un `try/catch` seul ne verrait
    // jamais un ménage raté, et l'orphelin resterait sans que rien ne l'indique. Les deux
    // chemins sont donc traités, et aucun ne fait échouer l'appelant.
    try {
        const { error } = await client()
            .from(bucket())
            .remove([...paths]);
        if (error) {
            console.error("Suppression de pièces refusée", { paths, error });
        }
    } catch (error) {
        console.error("Suppression de pièces impossible", { paths, error });
    }
}
