"use server";

import { createSmtpSender, DomainError } from "@clemperl/core";
import {
    decideOnApplication,
    ERROR_APPLICATION_ALREADY_DECIDED,
    prisma,
    readFullApplication,
} from "@clemperl/db";
import {
    buildApprovalMessage,
    buildRejectionMessage,
    slugifyShopName,
    validateDecision,
    type TRejectionReason,
} from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/admin/fr.json";
import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../../lib/session";
import type { IDecisionState } from "./types/decision-state.interface";

const ERRORS = messages.errors.vendor_application as Record<string, string>;

export async function decide(
    _previous: IDecisionState,
    form: FormData,
): Promise<IDecisionState> {
    const session = await requireAdministrator();
    const applicationId = String(form.get("applicationId"));
    const application = await readFullApplication(prisma, applicationId);

    if (application === null) {
        return { message: [ERRORS["not_found"] as string] };
    }

    const outcome = form.get("outcome") === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
    const reason = (form.get("reason") || undefined) as TRejectionReason | undefined;
    const comment = String(form.get("comment") ?? "") || undefined;

    try {
        // Le domaine arbitre AVANT d'écrire : motif codé obligatoire sur un refus,
        // commentaire obligatoire quand le motif est « autre », et interdiction de
        // décider sur son propre dossier.
        validateDecision({
            deciderId: session.user.id,
            applicantId: application.applicantId,
            outcome,
            reason: outcome === "ACCEPTED" ? undefined : reason,
            comment,
        });
    } catch (error) {
        const key =
            error instanceof DomainError ? error.i18nKey.split(".").pop() : "decide_failed";
        return { message: [ERRORS[key ?? "decide_failed"] ?? (ERRORS["decide_failed"] as string)] };
    }

    let vendorId: string | null;
    try {
        ({ vendorId } = await decideOnApplication(prisma, {
            applicationId,
            decidedById: session.user.id,
            outcome,
            reason: outcome === "ACCEPTED" ? undefined : reason,
            comment,
            slug: slugifyShopName(application.shopName),
        }));
    } catch (error) {
        const text = String(error);
        // Deux administrateurs ont ouvert la même fiche : la base a tranché, pas nous.
        if (text.includes(ERROR_APPLICATION_ALREADY_DECIDED)) {
            revalidatePath("/applications/[id]", "page");
            return { message: [ERRORS["already_decided"] as string] };
        }
        // Deux boutiques homonymes : l'arbitrage du nom revient à l'administration.
        if (text.includes("vendors_slug_key")) {
            return { message: [ERRORS["slug_conflict"] as string] };
        }
        return { message: [ERRORS["decide_failed"] as string] };
    }

    // Hors transaction, et dans la langue du DÉPÔT : l'administration travaille en
    // français, le candidat pas forcément.
    const message =
        vendorId === null
            ? buildRejectionMessage(application.shopName, comment ?? "", application.locale)
            : buildApprovalMessage(application.shopName, application.locale);
    await createSmtpSender(
        process.env["SMTP_URL"] ?? "",
        process.env["EMAIL_FROM"] ?? "",
    ).send({ ...message, recipient: application.applicant.email });

    revalidatePath("/applications");
    revalidatePath("/applications/[id]", "page");
    return { message: [] };
}
