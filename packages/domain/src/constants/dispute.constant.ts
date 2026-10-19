import { E_DISPUTE_REASON, E_DISPUTE_STATUS } from "@clemperl/db/enums";

// Les deux délais sont des CONSTANTES, et le vendeur n'en règle aucun : libre de mettre le
// délai d'ouverture à zéro jour, il ne recevrait plus aucun litige. Les rendre réglables
// par l'administration se fera ici, en remplaçant la valeur par une lecture.
export const DISPUTE_OPENING_WINDOW_DAYS = 14;
export const DISPUTE_SILENCE_DAYS = 7;

// Trois pièces de 5 Mo tiennent dans le plafond de 16 Mo d'une action serveur.
export const MAX_DISPUTE_ATTACHMENTS = 3;

// Un récit plus long ne se lit plus, et la borne évite de stocker un texte arbitraire.
export const MAX_DISPUTE_MESSAGE_LENGTH = 5000;

// L'import vient de `@clemperl/db/enums`, le sous-chemin SANS client Prisma. Les motifs
// dérivent de l'énumération : une valeur ajoutée au schéma arrive ici sans qu'on y pense.
export const DISPUTE_REASONS: readonly string[] = Object.values(E_DISPUTE_REASON);

export const E_DISPUTE_ACTION = {
    SERVE: "SERVE",
    DECIDE_FOR_BUYER: "DECIDE_FOR_BUYER",
    DECIDE_FOR_VENDOR: "DECIDE_FOR_VENDOR",
} as const;

export type TDisputeAction = (typeof E_DISPUTE_ACTION)[keyof typeof E_DISPUTE_ACTION];

// Dérivé de l'énumération générée, comme `TOrderStatus` : un état ajouté au schéma fait
// cesser de compiler `DISPUTE_TRANSITIONS` tant qu'il n'a pas sa ligne.
export type TDisputeStatus = (typeof E_DISPUTE_STATUS)[keyof typeof E_DISPUTE_STATUS];

// La table dit quelles transitions existent, jamais qui les emprunte : l'acheteur seul se
// déclare servi, l'administration seule tranche, chacun derrière sa propre garde.
//
// Un litige tranché pour l'acheteur reste ouvert à `SERVE` : la plateforme ne sait pas que
// le vendeur s'est exécuté tant que l'acheteur ne le dit pas.
export const DISPUTE_TRANSITIONS: Readonly<
    Record<TDisputeStatus, Partial<Record<TDisputeAction, TDisputeStatus>>>
> = {
    OPEN: {
        SERVE: "SERVED",
        DECIDE_FOR_BUYER: "DECIDED_FOR_BUYER",
        DECIDE_FOR_VENDOR: "DECIDED_FOR_VENDOR",
    },
    DECIDED_FOR_BUYER: { SERVE: "SERVED" },
    DECIDED_FOR_VENDOR: {},
    SERVED: {},
};
