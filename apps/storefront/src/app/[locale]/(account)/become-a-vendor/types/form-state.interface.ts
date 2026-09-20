// Un seul format de sortie, qu'il y ait une ou dix fautes. Les clés sont traduites par
// la server action, jamais par le composant.
export interface IFormState {
    message: string[];
    success: boolean;
}

export const INITIAL_STATE: IFormState = { message: [], success: false };
