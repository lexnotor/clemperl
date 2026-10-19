export interface IOrderActionState {
    /** Vide quand l'action a abouti. L'écran n'affiche que ce qui n'est pas vide. */
    error: string;
}

// Cette constante ne peut PAS vivre dans le fichier « use server » des actions : un tel
// fichier n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand
// même arrive `undefined` au client : l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_STATE: IOrderActionState = { error: "" };
