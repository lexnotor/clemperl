// Hors du fichier `"use server"` : un tel module ne peut exporter QUE des fonctions
// asynchrones. Une constante y est acceptée à la compilation et arrive `undefined` au
// composant client.
export interface IDecisionState {
    message: string[];
}

export const INITIAL_DECISION_STATE: IDecisionState = { message: [] };
