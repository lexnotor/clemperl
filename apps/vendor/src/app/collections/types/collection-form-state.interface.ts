export interface ICollectionFormState {
    message: string[];
    saved: boolean;
}

// Cette constante ne peut PAS vivre dans un fichier « use server » : un tel fichier
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client, l'erreur qu'on lit alors parlant d'autre chose.
export const INITIAL_COLLECTION_STATE: ICollectionFormState = { message: [], saved: false };
