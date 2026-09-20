import type { TStatutDossier } from "../types/index.js";

export const E_ACTION_DOSSIER = {
    ACCEPTER: "ACCEPTER",
    REFUSER: "REFUSER",
    RESOUMETTRE: "RESOUMETTRE",
} as const;

export type TActionDossier = (typeof E_ACTION_DOSSIER)[keyof typeof E_ACTION_DOSSIER];

// Une donnée plutôt qu'une cascade de `if` : la lire suffit à connaître tout le système.
// Un état sans entrée est terminal.
export const TRANSITIONS_DOSSIER: Readonly<
    Record<TStatutDossier, Partial<Record<TActionDossier, TStatutDossier>>>
> = {
    SUBMITTED: {
        ACCEPTER: "ACCEPTED",
        REFUSER: "REJECTED",
    },
    REJECTED: {
        RESOUMETTRE: "SUBMITTED",
    },
    ACCEPTED: {},
};
