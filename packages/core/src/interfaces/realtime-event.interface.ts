import type { TRealtimeEventKind } from "../enums/index.js";

// Ce que dépose un front après une écriture réussie. Il ne porte que des identifiants :
// l'API relit l'objet pour composer l'alerte, de sorte qu'aucune donnée n'y transite.
export type TRealtimeEvent =
    | { kind: "order.placed"; orderId: string }
    | { kind: "order.status_changed"; orderId: string; by: "VENDOR" | "ADMIN" }
    | { kind: "payment.status_changed"; orderId: string; by: "VENDOR" | "PROVIDER" }
    | { kind: "product_image.processed"; imageId: string }
    | { kind: "dispute.opened"; disputeId: string }
    | { kind: "dispute.message_posted"; disputeId: string; by: "BUYER" | "VENDOR" }
    | { kind: "dispute.decided"; disputeId: string }
    | { kind: "dispute.served"; disputeId: string };

// Ce que reçoit le navigateur : de quoi composer l'alerte, jamais une donnée que la page
// du destinataire n'affiche pas déjà.
export interface IRealtimeNotice {
    kind: TRealtimeEventKind;
    reference?: string;
    productTitle?: string;
    imageStatus?: "READY" | "FAILED";
}
