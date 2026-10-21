"use server";

import { randomUUID } from "node:crypto";
import {
    deleteDocuments,
    publishRealtimeEvent,
    submittedFiles,
    uploadDocumentBatch,
    type IStoredDocument,
} from "@clemperl/core";
import { ERROR_DISPUTE_STALE, postDisputeMessageAsVendor, prisma } from "@clemperl/db";
import { validateDisputeMessage } from "@clemperl/domain";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { revalidatePath } from "next/cache";
import { requireVendorMembership } from "../../../lib/session";
import type { IDisputeFormState } from "../types/dispute-form-state.interface";
import { violationText } from "./dispute-violation-text";

const T = messages.disputes;

export async function replyToDisputeAsVendorAction(
    _previous: IDisputeFormState,
    form: FormData,
): Promise<IDisputeFormState> {
    // La garde est rappelée ICI. La boutique vient de la session, jamais d'un champ posté, et
    // `disputeId` arrive d'un champ caché : c'est la portée du dépôt qui garde.
    const { session, vendor } = await requireVendorMembership();
    const disputeId = String(form.get("disputeId") ?? "");
    const body = String(form.get("body") ?? "").trim();
    const files = submittedFiles(form, "attachments");
    // Rendue sur chaque refus, pour que le formulaire réaffiche la réponse.
    const values = { body };

    // Rien n'est téléversé tant que le message n'est pas recevable.
    const violations = validateDisputeMessage({
        body,
        attachments: files.map((file) => ({ mimeType: file.type, sizeBytes: file.size })),
    });
    if (violations.length > 0) {
        return { message: violations.map((v) => violationText(v.i18nKey, v.i18nArgs)), values };
    }

    let stored: IStoredDocument[];
    try {
        stored = await uploadDocumentBatch(`disputes/${randomUUID()}`, "evidence", files);
    } catch (error) {
        console.error("replyToDisputeAsVendor: dépôt des pièces", error);
        return { message: [T.failed], values };
    }

    try {
        await postDisputeMessageAsVendor(prisma, {
            vendorId: vendor.id,
            authorId: session.user.id,
            disputeId,
            body,
            attachments: stored,
        });
    } catch (error) {
        // Compensation : il n'existe pas de transaction commune au stockage et à la base.
        await deleteDocuments(stored.map((document) => document.objectPath));
        if (error instanceof Error && error.message === ERROR_DISPUTE_STALE) {
            return { message: [T.moved], values };
        }
        console.error("replyToDisputeAsVendor", error);
        return { message: [T.failed], values };
    }

    await publishRealtimeEvent({ kind: "dispute.message_posted", disputeId, by: "VENDOR" });

    revalidatePath("/orders/[id]", "page");
    revalidatePath("/orders");
    return { message: [] };
}
