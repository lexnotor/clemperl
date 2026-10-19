import type { IStoredDocument, IUploadableFile } from "../interfaces/index.js";
import { buildObjectPath } from "./document-path.utils.js";
import { deleteDocuments, uploadDocument } from "./document-storage.utils.js";

// La boutique et l'espace vendeur déposent des preuves de la même façon. La séquence vit
// ICI, une fois : recopiée dans les deux applications, elle divergerait à la première règle
// ajoutée, et chaque copie resterait valide seule.

// Un champ de fichier laissé vide poste quand même une entrée, de taille nulle. Le garder le
// stockerait comme une pièce et le compterait dans la limite.
//
// La TAILLE décide, jamais le nom : le navigateur envoie un nom vide, mais le décodeur des
// actions serveur de Next le perd, et `FormData` nomme alors le fichier `blob`. Une pièce
// vide ne prouve rien de toute façon.
export function submittedFiles(form: FormData, field: string): IUploadableFile[] {
    return form
        .getAll(field)
        .filter((entry): entry is File => typeof entry !== "string" && entry.size > 0);
}

// Téléverse dans l'ordre. Il n'existe pas de transaction commune au stockage et à la base :
// si un dépôt échoue, ceux qui l'ont précédé sont supprimés avant de relever l'erreur, sans
// quoi ils resteraient orphelins dans le bucket.
export async function uploadDocumentBatch(
    prefix: string,
    kind: string,
    files: readonly IUploadableFile[],
): Promise<IStoredDocument[]> {
    const stored: IStoredDocument[] = [];
    try {
        for (const file of files) {
            const objectPath = buildObjectPath(prefix, kind, file.name);
            await uploadDocument(objectPath, await file.arrayBuffer(), file.type);
            stored.push({
                objectPath,
                mimeType: file.type,
                sizeBytes: file.size,
                originalName: file.name,
            });
        }
    } catch (error) {
        await deleteDocuments(stored.map((document) => document.objectPath));
        throw error;
    }
    return stored;
}
