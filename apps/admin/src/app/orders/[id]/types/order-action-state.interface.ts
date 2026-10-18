export interface IOrderActionState {
    /** Vide quand l'action a abouti. L'écran n'affiche que ce qui n'est pas vide. */
    error: string;
}

export const INITIAL_STATE: IOrderActionState = { error: "" };
