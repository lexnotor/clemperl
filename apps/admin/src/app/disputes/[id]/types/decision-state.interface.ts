// Hors du module `"use server"` : celui-ci n'exporte que des fonctions asynchrones, et une
// constante qu'on y mettrait arriverait `undefined` au composant client.
export interface IDecisionState {
    message: string[];
}

export const INITIAL_DECISION_STATE: IDecisionState = { message: [] };
