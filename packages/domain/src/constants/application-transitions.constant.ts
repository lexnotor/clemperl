import type { TApplicationStatus } from "../types/index.js";

export const E_APPLICATION_ACTION = {
    APPROVE: "APPROVE",
    REJECT: "REJECT",
    RESUBMIT: "RESUBMIT",
} as const;

export type TApplicationAction =
    (typeof E_APPLICATION_ACTION)[keyof typeof E_APPLICATION_ACTION];

// Une donnée plutôt qu'une cascade de `if` : la lire suffit à connaître tout le système.
// Un état sans entrée est terminal.
export const APPLICATION_TRANSITIONS: Readonly<
    Record<TApplicationStatus, Partial<Record<TApplicationAction, TApplicationStatus>>>
> = {
    SUBMITTED: {
        APPROVE: "ACCEPTED",
        REJECT: "REJECTED",
    },
    REJECTED: {
        RESUBMIT: "SUBMITTED",
    },
    ACCEPTED: {},
};
