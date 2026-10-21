"use server";

import { createSmtpSender, publishRealtimeEvent } from "@clemperl/core";
import {
    ERROR_DISPUTE_NOT_FOUND,
    ERROR_DISPUTE_STALE,
    decideDispute,
    prisma,
    readDisputeForAdministration,
} from "@clemperl/db";
import {
    advanceDispute,
    buildDisputeDecisionMessage,
    E_DISPUTE_ACTION,
    ForbiddenDisputeTransitionError,
    validateDisputeDecision,
} from "@clemperl/domain";
import { DEFAULT_LOCALE } from "@clemperl/i18n";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdministrator } from "../../../lib/session";
import type { IDecisionState } from "./types/decision-state.interface";

const ERRORS = messages.errors.dispute;
const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";
const VENDOR = process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "";

// Les DEUX seules issues que l'administration peut choisir. `SERVE` est une transition du
// domaine, mais elle appartient à l'acheteur : la valider contre toutes les actions la
// laisserait passer.
const DECISIONS = {
    DECIDE_FOR_BUYER: E_DISPUTE_ACTION.DECIDE_FOR_BUYER,
    DECIDE_FOR_VENDOR: E_DISPUTE_ACTION.DECIDE_FOR_VENDOR,
} as const;

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le formulaire ne la protège pas.
export async function decide(_previous: IDecisionState, form: FormData): Promise<IDecisionState> {
    const session = await requireAdministrator();
    const disputeId = String(form.get("disputeId") ?? "");
    const submitted = String(form.get("outcome") ?? "");
    const comment = String(form.get("comment") ?? "").trim();

    // Par `Object.hasOwn` et non par un accès direct : `constructor` rendrait une fonction.
    if (!Object.hasOwn(DECISIONS, submitted)) {
        return { message: [ERRORS.outcome_required] };
    }
    const action = DECISIONS[submitted as keyof typeof DECISIONS];
    if (validateDisputeDecision({ comment }).length > 0) {
        return { message: [ERRORS.comment_required] };
    }

    const dispute = await readDisputeForAdministration(prisma, disputeId);
    if (dispute === null) {
        return { message: [ERRORS.not_found] };
    }

    let outcome: "DECIDED_FOR_BUYER" | "DECIDED_FOR_VENDOR";
    let decision: Awaited<ReturnType<typeof decideDispute>>;
    try {
        // Le DOMAINE décide de la transition, le dépôt écrit sous comparaison-et-échange :
        // deux administrateurs ne tranchent pas deux fois.
        outcome = advanceDispute(dispute.status, action) as typeof outcome;
        decision = await decideDispute(prisma, {
            disputeId: dispute.id,
            decidedById: session.user.id,
            from: dispute.status,
            status: outcome,
            comment,
        });
    } catch (error) {
        if (error instanceof Error && error.message === ERROR_DISPUTE_NOT_FOUND) {
            return { message: [ERRORS.not_found] };
        }
        const moved =
            error instanceof ForbiddenDisputeTransitionError ||
            (error instanceof Error && error.message === ERROR_DISPUTE_STALE);
        if (moved) {
            return { message: [ERRORS.moved] };
        }
        console.error("decide", error);
        return { message: [ERRORS.failed] };
    }

    // Le dépôt vient avant les courriels et avant `redirect`, qui lève et l'empêcherait.
    await publishRealtimeEvent({ kind: "dispute.decided", disputeId: dispute.id });

    // Les deux courriels partent APRÈS l'écriture, et les deux sont TENTÉS même si le
    // premier échoue : une partie ne doit pas rester sans nouvelles parce que le relais a
    // refusé l'autre. Un échec ne défait pas la décision, qui est un fait.
    const prefix = decision.buyerLocale === DEFAULT_LOCALE ? "" : `/${decision.buyerLocale}`;
    // L'expéditeur se crée DANS chaque envoi : sans adresse de relais, sa création lève, et
    // cette erreur doit devenir un envoi raté comme un autre, pas une page d'erreur affichée
    // après une décision déjà écrite.
    const send = async (message: Parameters<ReturnType<typeof createSmtpSender>["send"]>[0]) =>
        createSmtpSender(process.env["SMTP_URL"] ?? "", process.env["EMAIL_FROM"] ?? "").send(message);
    const deliveries = await Promise.allSettled([
        send({
            ...buildDisputeDecisionMessage(
                {
                    reference: decision.reference,
                    outcome,
                    party: "BUYER",
                    comment,
                    link: `${STOREFRONT}${prefix}/orders/${decision.reference}/dispute`,
                },
                decision.buyerLocale,
            ),
            recipient: decision.buyerEmail,
        }),
        send({
            ...buildDisputeDecisionMessage(
                {
                    reference: decision.reference,
                    outcome,
                    party: "VENDOR",
                    comment,
                    link: `${VENDOR}/orders/${decision.orderId}`,
                },
                decision.vendorLocale,
            ),
            recipient: decision.vendorContactEmail,
        }),
    ]);

    revalidatePath("/disputes");
    revalidatePath("/disputes/[id]", "page");

    // L'avis voyage dans l'URL et non dans l'état du formulaire : tranché, le litige n'offre
    // plus de formulaire, et un message porté par son état disparaîtrait avec lui.
    const failed = deliveries.some((delivery) => delivery.status === "rejected");
    if (failed) {
        console.error("decide: courriel non parti", deliveries);
    }
    // HORS de tout `try` : `redirect` lève pour interrompre le rendu.
    redirect(`/disputes/${dispute.id}?notice=${failed ? "mail_failed" : "decided"}`);
}
