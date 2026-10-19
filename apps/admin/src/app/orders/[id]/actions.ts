"use server";

import {
    ERROR_ORDER_NOT_FOUND,
    ERROR_ORDER_STATUS_STALE,
    prisma,
    readOrderForAdministration,
    setOrderStatusAsAdministrator,
} from "@clemperl/db";
import {
    advanceOrder,
    E_ORDER_ACTION,
    ForbiddenOrderTransitionError,
    type TOrderAction,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../../lib/session";
import type { IOrderActionState } from "./types/order-action-state.interface";

const ERRORS = messages.errors.order;

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le bouton ne la protège pas.
export async function advance(
    _previous: IOrderActionState,
    form: FormData,
): Promise<IOrderActionState> {
    await requireAdministrator();
    const orderId = String(form.get("orderId") ?? "");
    const submitted = String(form.get("action") ?? "");

    // Par `Object.hasOwn` et non par un accès direct : une action nommée `constructor`
    // rendrait une fonction au lieu de `undefined`, que le domaine prendrait pour valide.
    if (!Object.hasOwn(E_ORDER_ACTION, submitted)) {
        return { error: ERRORS["failed"] };
    }
    const action = submitted as TOrderAction;

    const order = await readOrderForAdministration(prisma, orderId);
    if (order === null) {
        return { error: ERRORS["not_found"] };
    }

    // Un paiement reçu ne change pas l'état de la commande : la comparaison sur l'état ne
    // voit donc pas qu'il est arrivé entre l'affichage et le clic. Annuler reste permis,
    // mais l'écran doit avoir dit qu'aucun remboursement ne suit ; s'il ne l'a pas dit, il
    // est périmé. Un paiement reçu ne revient jamais en arrière, seul ce sens compte.
    const shownPayment = String(form.get("paymentStatus") ?? "");
    if (
        action === E_ORDER_ACTION.CANCEL &&
        order.paymentStatus === "SETTLED" &&
        shownPayment !== "SETTLED"
    ) {
        return { error: ERRORS["settled"] };
    }

    try {
        // Le DOMAINE décide de la transition, le dépôt ne fait qu'écrire.
        const next = advanceOrder(order.status, action);

        // L'état LU repart avec l'écriture : entre cette lecture et cette écriture, le
        // vendeur a pu faire avancer sa commande, et sans `from` on écraserait sa décision.
        await setOrderStatusAsAdministrator(prisma, {
            orderId,
            from: order.status,
            status: next,
        });
    } catch (error) {
        if (error instanceof Error && error.message === ERROR_ORDER_NOT_FOUND) {
            return { error: ERRORS["not_found"] };
        }
        const moved =
            error instanceof ForbiddenOrderTransitionError ||
            (error instanceof Error && error.message === ERROR_ORDER_STATUS_STALE);
        if (moved) {
            return { error: ERRORS["moved"] };
        }
        console.error("advance", error);
        return { error: ERRORS["failed"] };
    }

    revalidatePath("/orders");
    revalidatePath("/orders/[id]", "page");
    return { error: "" };
}
