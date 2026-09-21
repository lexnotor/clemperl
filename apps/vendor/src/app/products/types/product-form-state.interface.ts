export interface IProductFormState {
    message: string[];
    saved: boolean;
}

// Cette constante ne peut PAS vivre dans un fichier « use server » : un tel fichier
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client — l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_PRODUCT_STATE: IProductFormState = { message: [], saved: false };
