import { StorageClient } from "@supabase/storage-js";

// Construit à la demande et non à l'import : charger ce module dans un contexte sans
// variables d'environnement — un test unitaire, une étape de build — ne doit pas échouer.
//
// Extrait ici parce que DEUX buckets l'utilisent désormais. Le dupliquer ferait deux
// façons de lire les mêmes variables, qui divergeraient au premier ajustement.
export function storageClient(): StorageClient {
    const url = process.env["STORAGE_URL"];
    const key = process.env["STORAGE_SERVICE_KEY"];
    if (!url || !key) {
        throw new Error("STORAGE_URL ou STORAGE_SERVICE_KEY est absente.");
    }
    return new StorageClient(url, { Authorization: `Bearer ${key}` });
}
