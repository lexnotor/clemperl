"use server";

import { randomUUID } from "node:crypto";
import {
    createSmtpSender,
    deleteDocuments,
    submittedFiles,
    uploadDocumentBatch,
    type IStoredDocument,
} from "@clemperl/core";
import {
    ERROR_DISPUTE_EXISTS,
    ERROR_DISPUTE_INVALID_LINES,
    ERROR_DISPUTE_NOT_ELIGIBLE,
    ERROR_DISPUTE_STALE,
    markDisputeServed,
    openDispute,
    postDisputeMessageAsBuyer,
    prisma,
    readDisputeForBuyer,
} from "@clemperl/db";
import {
    advanceDispute,
    buildDisputeOpenedMessage,
    disputeOpeningCutoff,
    E_DISPUTE_ACTION,
    ForbiddenDisputeTransitionError,
    validateDisputeMessage,
    validateDisputeOpening,
    type IDisputeViolation,
} from "@clemperl/domain";
import { DEFAULT_LOCALE, isSupportedLocale } from "@clemperl/i18n";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "../../../../../env";
import { requireVerifiedSession } from "../../../../../lib/session";
import type { IDisputeFormState } from "./types/dispute-form-state.interface";

const VENDOR_URL = process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "";

// Le domaine rend des clés complètes. Une clé absente de cette table retombe sur un message
// générique plutôt que de montrer une chaîne brute à l'acheteur.
const VIOLATION_KEYS: Record<
    string,
    | "lines_required"
    | "reason_unknown"
    | "body_required"
    | "body_too_long"
    | "too_many_attachments"
    | "unsupported_media_type"
    | "attachment_too_large"
> = {
    "errors.dispute.lines_required": "lines_required",
    "errors.dispute.reason_unknown": "reason_unknown",
    "errors.dispute.body_required": "body_required",
    "errors.dispute.body_too_long": "body_too_long",
    "errors.dispute.too_many_attachments": "too_many_attachments",
    "errors.dispute.unsupported_media_type": "unsupported_media_type",
    "errors.dispute.attachment_too_large": "attachment_too_large",
};

// Comparaison EXACTE du message, jamais par sous-chaîne. Une commande hors de portée de
// l'acheteur reçoit le message générique : la nommer confirmerait qu'elle existe.
const REFUSALS: Record<string, "exists" | "notEligible" | "invalidLines"> = {
    [ERROR_DISPUTE_EXISTS]: "exists",
    [ERROR_DISPUTE_NOT_ELIGIBLE]: "notEligible",
    [ERROR_DISPUTE_INVALID_LINES]: "invalidLines",
};

type TTranslate = Awaited<ReturnType<typeof getTranslations>>;

function translateViolations(
    violations: readonly IDisputeViolation[],
    tErrors: TTranslate,
    t: TTranslate,
): string[] {
    return violations.map((violation) => {
        // Par `Object.hasOwn` : une clé nommée `constructor` rendrait une fonction.
        const key = Object.hasOwn(VIOLATION_KEYS, violation.i18nKey)
            ? VIOLATION_KEYS[violation.i18nKey]
            : undefined;
        return key ? tErrors(key, violation.i18nArgs as never) : t("failed");
    });
}

// Le français n'a pas de préfixe, l'anglais si : le routage de la boutique est `as-needed`.
function disputePath(locale: string, reference: string, notice: "opened" | "mail_failed"): string {
    const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
    return `${prefix}/orders/${reference}/dispute?notice=${notice}`;
}

export async function openDisputeAction(
    _previous: IDisputeFormState,
    form: FormData,
): Promise<IDisputeFormState> {
    const reference = String(form.get("reference") ?? "");
    // La garde est rappelée ICI : une action serveur est une route publique, et l'acheteur
    // vient de la session, jamais d'un champ posté.
    const session = await requireVerifiedSession(`/orders/${reference}/dispute`);
    const t = await getTranslations("disputes");
    const tErrors = await getTranslations("errors.dispute");

    const lineIds = form.getAll("lineIds").map(String);
    const reason = String(form.get("reason") ?? "");
    const body = String(form.get("body") ?? "").trim();
    const posted = String(form.get("locale") ?? "");
    const locale = isSupportedLocale(posted) ? posted : DEFAULT_LOCALE;
    const files = submittedFiles(form, "attachments");
    // Rendue sur chaque refus : React vide le formulaire dès que l'action se termine, et
    // l'acheteur perdrait sinon son récit. Les fichiers, eux, ne se réinjectent pas.
    const values = { body, reason, lineIds };

    // Rien n'est téléversé tant que l'ouverture n'est pas recevable : chaque formulaire
    // refusé laisserait sinon un orphelin dans le bucket.
    const violations = validateDisputeOpening({
        lineIds,
        reason,
        body,
        attachments: files.map((file) => ({ mimeType: file.type, sizeBytes: file.size })),
    });
    if (violations.length > 0) {
        return { message: translateViolations(violations, tErrors, t), values };
    }

    let stored: IStoredDocument[];
    try {
        stored = await uploadDocumentBatch(`disputes/${randomUUID()}`, "evidence", files);
    } catch (error) {
        console.error("openDispute: dépôt des pièces", error);
        return { message: [t("failed")], values };
    }

    let opened: Awaited<ReturnType<typeof openDispute>>;
    try {
        opened = await openDispute(prisma, {
            buyerId: session.user.id,
            orderReference: reference,
            // Le DOMAINE fixe la coupure, et le dépôt la revérifie dans son écriture.
            shippedAfter: disputeOpeningCutoff(new Date()),
            reason,
            lineIds,
            body,
            locale,
            attachments: stored,
        });
    } catch (error) {
        // Compensation : il n'existe pas de transaction commune au stockage et à la base.
        await deleteDocuments(stored.map((document) => document.objectPath));
        // Par `Object.hasOwn` : un message d'erreur inattendu comme `constructor` ou
        // `toString` rendrait sinon une fonction, prise pour un refus connu.
        const key =
            error instanceof Error && Object.hasOwn(REFUSALS, error.message)
                ? REFUSALS[error.message]
                : undefined;
        if (key === undefined) {
            console.error("openDispute", error);
        }
        return { message: [t(key ?? "failed")], values };
    }

    // Le courriel part APRÈS l'écriture, et ne la défait pas : le litige existe. L'écran dit
    // seulement que la boutique n'a pas été prévenue, et elle le verra dans son espace.
    let notice: "opened" | "mail_failed" = "opened";
    try {
        const message = buildDisputeOpenedMessage(
            { reference: opened.reference, reason, link: `${VENDOR_URL}/orders/${opened.orderId}` },
            opened.vendorLocale,
        );
        await createSmtpSender(env.SMTP_URL, env.EMAIL_FROM).send({
            ...message,
            recipient: opened.vendorContactEmail,
        });
    } catch (error) {
        console.error("openDispute: courriel non parti", error);
        notice = "mail_failed";
    }

    revalidatePath("/[locale]/orders/[reference]", "page");
    revalidatePath("/[locale]/orders/[reference]/dispute", "page");
    // HORS de tout `try` : `redirect` lève pour interrompre le rendu, et un `catch` qui
    // l'attraperait le prendrait pour une panne.
    redirect(disputePath(locale, opened.reference, notice));
}

export async function replyToDisputeAction(
    _previous: IDisputeFormState,
    form: FormData,
): Promise<IDisputeFormState> {
    const reference = String(form.get("reference") ?? "");
    const session = await requireVerifiedSession(`/orders/${reference}/dispute`);
    const t = await getTranslations("disputes");
    const tErrors = await getTranslations("errors.dispute");

    // `disputeId` arrive d'un champ caché que n'importe qui peut réécrire : c'est la portée
    // par acheteur, dans la signature du dépôt, qui garde.
    const disputeId = String(form.get("disputeId") ?? "");
    const body = String(form.get("body") ?? "").trim();
    const files = submittedFiles(form, "attachments");
    // Rendue sur chaque refus, pour que le formulaire réaffiche la réponse.
    const values = { body };

    const violations = validateDisputeMessage({
        body,
        attachments: files.map((file) => ({ mimeType: file.type, sizeBytes: file.size })),
    });
    if (violations.length > 0) {
        return { message: translateViolations(violations, tErrors, t), values };
    }

    let stored: IStoredDocument[];
    try {
        stored = await uploadDocumentBatch(`disputes/${randomUUID()}`, "evidence", files);
    } catch (error) {
        console.error("replyToDispute: dépôt des pièces", error);
        return { message: [t("failed")], values };
    }

    try {
        await postDisputeMessageAsBuyer(prisma, {
            buyerId: session.user.id,
            disputeId,
            body,
            attachments: stored,
        });
    } catch (error) {
        await deleteDocuments(stored.map((document) => document.objectPath));
        // Tranché ou servi pendant que la page était ouverte : la base a refusé le message.
        if (error instanceof Error && error.message === ERROR_DISPUTE_STALE) {
            return { message: [t("moved")], values };
        }
        console.error("replyToDispute", error);
        return { message: [t("failed")], values };
    }

    revalidatePath("/[locale]/orders/[reference]/dispute", "page");
    return { message: [] };
}

export async function markServedAction(
    _previous: IDisputeFormState,
    form: FormData,
): Promise<IDisputeFormState> {
    const reference = String(form.get("reference") ?? "");
    const session = await requireVerifiedSession(`/orders/${reference}/dispute`);
    const t = await getTranslations("disputes");
    const disputeId = String(form.get("disputeId") ?? "");

    // Relu depuis la commande de l'acheteur, jamais pris tel quel du formulaire : l'état lu
    // repart avec l'écriture, et sans lui un écran périmé écraserait une décision.
    const dispute = await readDisputeForBuyer(prisma, {
        buyerId: session.user.id,
        orderReference: reference,
    });
    if (dispute === null || dispute.id !== disputeId) {
        return { message: [t("failed")] };
    }

    try {
        // Le DOMAINE décide que servir est permis depuis cet état ; le dépôt écrit.
        advanceDispute(dispute.status, E_DISPUTE_ACTION.SERVE);
        await markDisputeServed(prisma, {
            buyerId: session.user.id,
            disputeId: dispute.id,
            from: dispute.status,
        });
    } catch (error) {
        const moved =
            error instanceof ForbiddenDisputeTransitionError ||
            (error instanceof Error && error.message === ERROR_DISPUTE_STALE);
        if (moved) {
            return { message: [t("moved")] };
        }
        console.error("markServed", error);
        return { message: [t("failed")] };
    }

    revalidatePath("/[locale]/orders/[reference]", "page");
    revalidatePath("/[locale]/orders/[reference]/dispute", "page");
    return { message: [] };
}
