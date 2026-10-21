import type { TRealtimeEvent } from "@clemperl/core";

// Qui doit être prévenu d'un événement : celui qui l'a provoqué le voit déjà sur sa page,
// donc il n'est jamais destinataire. Le `switch` est exhaustif et sans `default` : ajouter
// un type d'événement sans trancher son destinataire ne compile pas, TypeScript refusant
// une fonction qui peut finir sans retour. Un `default` inatteignable échapperait à la
// couverture de 100 %.
export function realtimeRecipients(event: TRealtimeEvent): readonly ("BUYER" | "SHOP")[] {
    switch (event.kind) {
        case "order.placed":
        case "product_image.processed":
        case "dispute.opened":
        case "dispute.served":
            return ["SHOP"];
        case "order.status_changed":
            return event.by === "ADMIN" ? ["BUYER", "SHOP"] : ["BUYER"];
        case "payment.status_changed":
            return event.by === "PROVIDER" ? ["BUYER", "SHOP"] : ["BUYER"];
        case "dispute.message_posted":
            return event.by === "BUYER" ? ["SHOP"] : ["BUYER"];
        case "dispute.decided":
            return ["BUYER", "SHOP"];
    }
}
