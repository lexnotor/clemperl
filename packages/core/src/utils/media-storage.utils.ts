import { storageClient } from "./storage-client.utils.js";

// Le bucket des MÉDIAS, distinct de celui des justificatifs. La séparation est une
// décision de sécurité : la route de relais lit un chemin venu de l'URL, et deux buckets
// rendent impossible qu'elle serve une pièce d'identité. Le schéma d'environnement
// refuse d'ailleurs que les deux noms soient égaux.
function mediaBucket(): string {
    const name = process.env["STORAGE_MEDIA_BUCKET"];
    if (!name) {
        throw new Error("STORAGE_MEDIA_BUCKET est absente.");
    }
    return name;
}

export async function readMedia(path: string): Promise<Blob> {
    const { data, error } = await storageClient().from(mediaBucket()).download(path);
    if (error || !data) {
        throw error ?? new Error(`Média introuvable : ${path}`);
    }
    return data;
}

// `upsert` à vrai, contrairement au dépôt des justificatifs : une image relancée après
// échec réécrit ses déclinaisons au même endroit, et refuser l'écrasement ferait échouer
// la relance sur un chemin qu'on vient nous-mêmes de choisir.
export async function uploadMedia(
    path: string,
    content: ArrayBuffer,
    mimeType: string,
): Promise<void> {
    const { error } = await storageClient()
        .from(mediaBucket())
        .upload(path, content, { contentType: mimeType, upsert: true });
    if (error) {
        throw error;
    }
}

// Supprime un dossier entier — l'original ET ses déclinaisons. Elle n'échoue jamais
// bruyamment : un objet orphelin coûte de l'espace, et faire échouer la suppression
// d'une ligne parce qu'un ménage a raté serait une régression.
export async function deleteMediaPrefix(prefix: string): Promise<void> {
    try {
        const client = storageClient().from(mediaBucket());

        // Le client RENVOIE son erreur au lieu de la lever : un `try/catch` seul ne
        // verrait jamais un ménage raté. Les deux chemins sont donc traités, et aucun ne
        // fait échouer l'appelant.
        const { data, error: listError } = await client.list(prefix);
        if (listError || !data) {
            console.error("Listage du préfixe refusé", { prefix, listError });
            return;
        }

        const paths = data.map((entry) => `${prefix}/${entry.name}`);
        if (paths.length === 0) {
            return;
        }

        const { error } = await client.remove(paths);
        if (error) {
            console.error("Suppression de médias refusée", { prefix, error });
        }
    } catch (error) {
        console.error("Suppression de médias impossible", { prefix, error });
    }
}
