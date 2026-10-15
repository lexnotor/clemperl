export interface IModerationState {
    message: string[];
}

// La constante vit ICI et non dans `actions.ts` : un fichier « use server » n'exporte que
// des fonctions asynchrones, et une constante qu'on y exporte quand même arrive
// `undefined` au client, avec une erreur qui parle d'autre chose.
export const INITIAL_STATE: IModerationState = { message: [] };
