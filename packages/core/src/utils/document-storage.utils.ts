import { StorageClient } from "@supabase/storage-js";

// Construit à la demande et non à l'import : charger ce module dans un contexte sans
// variables d'environnement — un test unitaire, une étape de build — ne doit pas échouer.
function client(): StorageClient {
    const url = process.env["STORAGE_URL"];
    const key = process.env["STORAGE_SERVICE_KEY"];
    if (!url || !key) {
        throw new Error("STORAGE_URL ou STORAGE_SERVICE_KEY est absente.");
    }
    return new StorageClient(url, { Authorization: `Bearer ${key}` });
}

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
    try {
        await client().from(bucket()).remove([...paths]);
    } catch (error) {
        console.error("Suppression de pièces impossible", { paths, error });
    }
}
