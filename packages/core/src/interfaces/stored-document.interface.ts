// Ce qu'un utilitaire de dépôt lit d'un fichier posté. Une forme STRUCTURELLE plutôt que le
// `File` du navigateur : ce paquet ne dépend d'aucune bibliothèque DOM, et un `File` y
// satisfait sans conversion.
export interface IUploadableFile {
    name: string;
    size: number;
    type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}

// Une pièce déposée, prête à être enregistrée en base.
export interface IStoredDocument {
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
}
