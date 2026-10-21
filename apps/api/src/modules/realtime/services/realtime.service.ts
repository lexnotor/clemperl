import type { IRealtimeNotice, TRealtimeEvent } from "@clemperl/core";
import {
    prisma,
    readDisputeAudience,
    readOrderAudience,
    readProductImageAudience,
} from "@clemperl/db";
import { realtimeRecipients } from "@clemperl/domain";
import { Injectable, Logger } from "@nestjs/common";
import { RealtimeGateway } from "../controllers";
import { shopRoom, userRoom } from "../utils";

type TRecipient = ReturnType<typeof realtimeRecipients>[number];

// Ce qu'un événement donne une fois relu en base : l'avis, et la salle de chaque partie que
// l'objet connaît. Une image n'a pas d'acheteur, donc pas de salle `BUYER`.
interface IResolvedEvent {
    notice: IRealtimeNotice;
    rooms: Partial<Record<TRecipient, string>>;
}

// Une image n'est annoncée qu'avec son issue. Toute autre valeur, en pratique `PENDING`,
// signifie que le vendeur l'a relancée entre l'événement et sa lecture : annoncer l'issue
// précédente serait faux, et le nouveau traitement annoncera la sienne.
function settledImageStatus(status: string): "READY" | "FAILED" | null {
    return status === "READY" || status === "FAILED" ? status : null;
}

// Relit qui est concerné, applique la règle du domaine, et émet. L'événement ne porte que des
// identifiants : l'avis est composé ICI, de ce que la page du destinataire affiche déjà (la
// référence de la commande, le titre du produit), jamais de plus.
@Injectable()
export class RealtimeService {
    private readonly logger = new Logger(RealtimeService.name);

    constructor(private readonly gateway: RealtimeGateway) {}

    // Ne rejette JAMAIS. Ses appelants viennent d'écrire, ou consomment la file : une alerte
    // perdue se rattrape au prochain affichage de la page, une écriture rendue en échec ne se
    // rattrape pas. L'échec est journalisé, puis avalé.
    async publish(event: TRealtimeEvent): Promise<void> {
        try {
            const resolved = await this.resolve(event);
            // L'objet a disparu entre le dépôt et la lecture, ou une image est repartie en
            // traitement : rien à annoncer, et ce n'est pas une erreur.
            if (resolved === null) {
                this.logger.log(`Événement ${event.kind} sans rien à annoncer, abandonné`);
                return;
            }

            // La règle « qui prévenir » est celle du domaine, appliquée telle quelle : la
            // redériver ici finirait par la contredire.
            const rooms = realtimeRecipients(event)
                .map((recipient) => resolved.rooms[recipient])
                .filter((room): room is string => room !== undefined);
            this.gateway.emitTo(rooms, resolved.notice);
        } catch (error) {
            // `?.` : un job peut arriver sans données, et c'est alors la lecture de `kind` qui
            // a levé. Le relire sans garde ferait rejeter `publish` depuis son propre `catch`.
            this.logger.error(`Événement ${event?.kind} non émis`, error);
        }
    }

    // Le `switch` est exhaustif et sans `default`, comme celui de la règle du domaine : un
    // genre ajouté sans lecture ne compile pas.
    private async resolve(event: TRealtimeEvent): Promise<IResolvedEvent | null> {
        switch (event.kind) {
            case "order.placed":
            case "order.status_changed":
            case "payment.status_changed":
                return this.orderEvent(event.kind, await readOrderAudience(prisma, event.orderId));
            case "dispute.opened":
            case "dispute.message_posted":
            case "dispute.decided":
            case "dispute.served":
                // L'audience d'un litige est celle de sa commande, et l'avis porte la
                // référence de celle-ci.
                return this.orderEvent(
                    event.kind,
                    await readDisputeAudience(prisma, event.disputeId),
                );
            case "product_image.processed":
                return this.imageEvent(await readProductImageAudience(prisma, event.imageId));
        }
    }

    private orderEvent(
        kind: TRealtimeEvent["kind"],
        audience: Awaited<ReturnType<typeof readOrderAudience>>,
    ): IResolvedEvent | null {
        if (audience === null) {
            return null;
        }
        return {
            notice: { kind, reference: audience.reference },
            rooms: { BUYER: userRoom(audience.buyerId), SHOP: shopRoom(audience.vendorId) },
        };
    }

    private imageEvent(
        audience: Awaited<ReturnType<typeof readProductImageAudience>>,
    ): IResolvedEvent | null {
        if (audience === null) {
            return null;
        }
        const imageStatus = settledImageStatus(audience.status);
        if (imageStatus === null) {
            return null;
        }
        return {
            notice: {
                kind: "product_image.processed",
                productTitle: audience.productTitle,
                imageStatus,
            },
            rooms: { SHOP: shopRoom(audience.vendorId) },
        };
    }
}
