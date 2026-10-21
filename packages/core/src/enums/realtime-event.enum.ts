// Événements temps réel : la valeur est celle qui circule dans la file, donc un contrat
// entre les fronts qui déposent et l'API qui émet. Ne pas la renommer sans les deux.
export const E_REALTIME_EVENT = {
    ORDER_PLACED: "order.placed",
    ORDER_STATUS_CHANGED: "order.status_changed",
    PAYMENT_STATUS_CHANGED: "payment.status_changed",
    PRODUCT_IMAGE_PROCESSED: "product_image.processed",
    DISPUTE_OPENED: "dispute.opened",
    DISPUTE_MESSAGE_POSTED: "dispute.message_posted",
    DISPUTE_DECIDED: "dispute.decided",
    DISPUTE_SERVED: "dispute.served",
} as const;

export type TRealtimeEventKind = (typeof E_REALTIME_EVENT)[keyof typeof E_REALTIME_EVENT];
