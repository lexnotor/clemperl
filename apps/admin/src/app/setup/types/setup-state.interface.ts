// Hors du fichier `"use server"` : un tel module ne peut exporter QUE des fonctions
// asynchrones. Une constante y est acceptée à la compilation et arrive `undefined` au
// composant client.
export interface ISetupState {
    message: string[];
}

export const INITIAL_SETUP_STATE: ISetupState = { message: [] };
