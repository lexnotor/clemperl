"use server";

import {
    ERROR_ORDER_NOT_FOUND,
    ERROR_ORDER_STATUS_STALE,
    prisma,
    readOrderForVendor,
    setOrderStatus,
} from "@clemperl/db";
import {
    advanceOrder,
    E_ORDER_ACTION,
    ForbiddenOrderTransitionError,
    type TOrderAction,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../../lib/session";
import {
    INITIAL_ORDER_ACTION_STATE,
    type IOrderActionState,
} from "../types/order-action-state.interface";

// Rend un ÉTAT, et non `void` : une commande qui a bougé ailleurs fait refuser le clic, et
// le vendeur doit lire qu'il regarde un écran périmé plutôt qu'un bouton sans effet.
export async function advanceOrderAction(
    _state: IOrderActionState,
    form: FormData,
): Promise<IOrderActionState> {
    // La garde est rappelée ICI : une action serveur est une route publique, et la page
    // qui l'a rendue ne la protège pas. `orderId` arrive d'un champ caché que n'importe
    // qui peut réécrire, et l'appartenance vit dans la signature du dépôt.
    const { vendor } = await requireVendorMembership();
    const orderId = String(form.get("orderId") ?? "");
    const submitted = String(form.get("action") ?? "");

    // L'action est VALIDÉE avant d'entrer dans le domaine, et par `Object.hasOwn` plutôt
    // que par un accès direct : la table des transitions est un objet littéral, et une
    // action nommée « constructor » y rendrait une fonction au lieu de `undefined`, que
    // `advanceOrder` prendrait alors pour un état valide.
    if (!Object.hasOwn(E_ORDER_ACTION, submitted)) {
        return { error: messages.errors.failed };
    }
    const action = submitted as TOrderAction;

    const order = await readOrderForVendor(prisma, { vendorId: vendor.id, orderId });
    if (!order) {
        return { error: messages.errors.orderNotFound };
    }

    try {
        // Le DOMAINE décide de la transition, le dépôt ne fait qu'écrire : `@clemperl/db`
        // ne peut pas importer `@clemperl/domain`, qui dépend déjà de lui.
        const next = advanceOrder(order.status, action);

        // L'état LU repart avec l'écriture, et c'est ce qui rend ce clic sûr. Entre cette
        // lecture et cette écriture, un collègue peut avoir accepté puis expédié : sans
        // `from`, le dépôt ramènerait une commande expédiée à « acceptée ».
        await setOrderStatus(prisma, {
            vendorId: vendor.id,
            orderId,
            from: order.status,
            status: next,
        });
    } catch (error) {
        console.error("advanceOrderAction", error);
        revalidatePath(`/orders/${orderId}`);

        // Une commande disparue de la boutique entre la lecture et l'écriture : elle a
        // changé de main, ou elle n'a jamais été celle-ci. Le message le dit tel quel.
        if (error instanceof Error && error.message === ERROR_ORDER_NOT_FOUND) {
            return { error: messages.errors.orderNotFound };
        }

        // Les deux autres refus se lisent pareil côté vendeur : la commande n'est plus
        // dans l'état que l'écran montre. `advanceOrder` refuse quand la page est périmée,
        // `setOrderStatus` quand elle a bougé entre cette lecture et cette écriture.
        const moved =
            error instanceof ForbiddenOrderTransitionError ||
            (error instanceof Error && error.message === ERROR_ORDER_STATUS_STALE);
        return { error: moved ? messages.errors.orderMoved : messages.errors.failed };
    }

    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    return INITIAL_ORDER_ACTION_STATE;
}
