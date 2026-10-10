import type { TOrderAction } from "@clemperl/domain";

export interface IOrderActionState {
    error: string | null;
}

// Cette constante ne peut PAS vivre dans un fichier « use server » : un tel fichier
// n'exporte que des fonctions asynchrones, et une constante qu'on y exporte quand même
// arrive `undefined` au client : l'erreur qu'on lit alors parle d'autre chose.
export const INITIAL_ORDER_ACTION_STATE: IOrderActionState = { error: null };

// Le libellé est résolu par la page, côté serveur. Le composant client reçoit du texte
// déjà écrit en français plutôt que le catalogue entier, qui partirait au navigateur.
export interface IOrderActionOption {
    action: TOrderAction;
    label: string;
}
