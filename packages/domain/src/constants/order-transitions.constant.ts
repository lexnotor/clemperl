export const E_ORDER_ACTION = {
    ACCEPT: "ACCEPT",
    SHIP: "SHIP",
    CANCEL: "CANCEL",
} as const;

export type TOrderAction = (typeof E_ORDER_ACTION)[keyof typeof E_ORDER_ACTION];

export type TOrderStatus = "PLACED" | "ACCEPTED" | "SHIPPED" | "CANCELLED";

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
export const ORDER_TRANSITIONS: Readonly<
    Record<TOrderStatus, Partial<Record<TOrderAction, TOrderStatus>>>
> = {
    PLACED: { ACCEPT: "ACCEPTED", CANCEL: "CANCELLED" },
    ACCEPTED: { SHIP: "SHIPPED", CANCEL: "CANCELLED" },
    SHIPPED: {},
    CANCELLED: {},
};
