import { E_ORDER_STATUS } from "@clemperl/db/enums";

export const E_ORDER_ACTION = {
    ACCEPT: "ACCEPT",
    SHIP: "SHIP",
    CANCEL: "CANCEL",
} as const;

export type TOrderAction = (typeof E_ORDER_ACTION)[keyof typeof E_ORDER_ACTION];

// Dérivé de l'énumération générée, comme `TApplicationStatus`. C'est ce qui fait qu'une
// valeur ajoutée au schéma se propage ici et que `ORDER_TRANSITIONS` cesse de compiler
// tant qu'elle n'a pas sa ligne. Ne pas la réécrire à la main : l'ajout annoncé plus bas
// passerait alors en silence.
//
// L'import vient de `@clemperl/db/enums`, le sous-chemin sans client Prisma, pour que ce
// fichier reste utilisable depuis un paquet navigateur.
export type TOrderStatus = (typeof E_ORDER_STATUS)[keyof typeof E_ORDER_STATUS];

// Une DONNÉE plutôt qu'une cascade de conditions : la lire suffit à connaître tout le
// système, et un état sans entrée est terminal. Même forme que les transitions de
// candidature écrites en T1b, pour la même raison.
//
// Seul le VENDEUR fait avancer. L'acheteur lit le même état et n'annule pas : une
// annulation touche un vendeur qui a peut-être déjà emballé, et ce qu'il faut alors est un
// échange, pas un bouton.
//
// T4 insérera son état de paiement entre `PLACED` et `ACCEPTED` en ajoutant deux lignes
// ici, sans toucher à un seul écran.
// `Record<TOrderStatus, ...>` et non `Partial` : c'est ce qui rend l'oubli d'un état
// IMPOSSIBLE à compiler le jour où le schéma en gagne un.
export const ORDER_TRANSITIONS: Readonly<
    Record<TOrderStatus, Partial<Record<TOrderAction, TOrderStatus>>>
> = {
    PLACED: { ACCEPT: "ACCEPTED", CANCEL: "CANCELLED" },
    ACCEPTED: { SHIP: "SHIPPED", CANCEL: "CANCELLED" },
    SHIPPED: {},
    CANCELLED: {},
};
