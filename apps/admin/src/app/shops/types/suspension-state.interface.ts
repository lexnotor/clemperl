// Ce type vit À PART de `actions.ts`, et ce n'est pas un rangement esthétique. Un fichier
// `"use server"` ne peut exporter que des fonctions asynchrones : une constante qu'on y
// exporte quand même arrive `undefined` au client, et l'erreur parle d'autre chose. Le
// dépôt a déjà payé ce piège.
export interface ISuspensionState {
    /** Vide quand tout s'est bien passé. Une phrase déjà traduite sinon. */
    message: string[];
}

export const INITIAL_STATE: ISuspensionState = { message: [] };
