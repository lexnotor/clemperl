export interface IProductFormState {
    message: string[];
    saved: boolean;
}

// Cette constante ne peut PAS vivre dans un fichier « use server » : un tel fichier
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client — l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_PRODUCT_STATE: IProductFormState = { message: [], saved: false };

export interface IPublishState {
    error: string | null;
}

// Même raison. Publier peut être refusé — le dépôt exige au moins une photo prête — et
// le bouton doit pouvoir le dire ; l'état qui le porte vit donc ici.
export const INITIAL_PUBLISH_STATE: IPublishState = { error: null };
