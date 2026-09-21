export interface IShopFormState {
    message: string[];
    saved: boolean;
}

// Cette constante ne peut PAS vivre dans `actions.ts` : un fichier « use server »
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client — l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_STATE: IShopFormState = { message: [], saved: false };
