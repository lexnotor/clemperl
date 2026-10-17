export interface IAccountsState {
    /** Vide quand tout s'est bien passé. Une phrase déjà traduite sinon. */
    message: string[];
}

// La constante vit ICI et non dans `actions.ts` : un fichier « use server » n'exporte que
// des fonctions asynchrones, et une constante qu'on y exporte quand même arrive
// `undefined` au client, avec une erreur qui parle d'autre chose.
export const INITIAL_STATE: IAccountsState = { message: [] };
