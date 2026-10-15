"use server";

import { createSmtpSender, DomainError } from "@clemperl/core";
import {
    ERROR_MODERATION_PRODUCT_NOT_FOUND,
    markProductReviewed,
    prisma,
    retireProduct,
} from "@clemperl/db";
import { buildRetirementMessage, validateModerationDecision } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../lib/session";
import type { IModerationState } from "./types/moderation-state.interface";

const ERRORS = messages.errors.moderation as Record<string, string>;

// La garde est rappelée ICI. Une action serveur est une route publique, et la page qui a
// rendu le bouton ne la protège pas.
export async function review(
    _previous: IModerationState,
    form: FormData,
): Promise<IModerationState> {
    await requireAdministrator();
    const productId = String(form.get("productId") ?? "");

    try {
        await markProductReviewed(prisma, productId);
    } catch (error) {
        console.error("review", error);
        return { message: [ERRORS["failed"] as string] };
    }

    revalidatePath("/moderation");
    return { message: [] };
}

export async function retire(
    _previous: IModerationState,
    form: FormData,
): Promise<IModerationState> {
    await requireAdministrator();
    const productId = String(form.get("productId") ?? "");
    const reason = String(form.get("reason") ?? "");
    const comment = String(form.get("comment") ?? "") || undefined;

    try {
        // Le DOMAINE arbitre avant d'écrire : motif du vocabulaire, et commentaire
        // obligatoire quand le motif est « autre ».
        validateModerationDecision({ reason, comment });
    } catch (error) {
        const key = error instanceof DomainError ? error.i18nKey.split(".").pop() : "failed";
        return { message: [ERRORS[key ?? "failed"] ?? (ERRORS["failed"] as string)] };
    }

    let retrait: Awaited<ReturnType<typeof retireProduct>>;
    try {
        retrait = await retireProduct(prisma, { productId });
    } catch (error) {
        const texte = String(error);
        if (texte.includes(ERROR_MODERATION_PRODUCT_NOT_FOUND)) {
            return { message: [ERRORS["not_found"] as string] };
        }
        console.error("retire", error);
        return { message: [ERRORS["failed"] as string] };
    }

    // Le courriel part HORS transaction, et seulement si le retrait a RÉELLEMENT eu lieu :
    // un vendeur qui reçoit deux fois le même reproche pour un seul acte croit qu'on
    // s'acharne.
    if (!retrait.alreadyRetired) {
        // Le CODE du motif, pas son libellé : c'est le domaine qui traduit, dans la langue
        // du vendeur. Le catalogue de l'administration n'existe qu'en français, et y
        // prendre le libellé ferait partir un message anglais portant un motif français.
        //
        // Les précisions suivent, telles que l'administrateur les a écrites. Le champ
        // s'affiche pour tous les motifs, donc elles partent pour tous : « description
        // trompeuse » ne dit pas CE QUI trompe.
        const message = buildRetirementMessage(
            retrait.title,
            reason,
            comment ?? "",
            retrait.locale,
        );

        // Le courriel part APRÈS l'écriture et ne doit pas l'annuler : le produit est
        // retiré, c'est un fait, et une panne de relais ne le remet pas au catalogue. Mais
        // elle ne doit pas non plus faire échouer l'action, sinon l'écran garde la ligne,
        // l'administrateur recommence, et la seconde fois `alreadyRetired` est vrai : le
        // vendeur ne serait alors JAMAIS prévenu.
        try {
            await createSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).send({ ...message, recipient: retrait.contactEmail });
        } catch (error) {
            console.error("retire: courriel non parti", error);
            revalidatePath("/moderation");
            return { message: [ERRORS["mail_failed"] as string] };
        }
    }

    revalidatePath("/moderation");
    return { message: [] };
}
