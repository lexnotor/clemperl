"use server";

import { randomUUID } from "node:crypto";
import {
    buildObjectPath,
    createSmtpSender,
    deleteDocuments,
    uploadDocument,
} from "@clemperl/core";
import { createApplication, prisma } from "@clemperl/db";
import {
    applicationSubmissionSchema,
    buildAcknowledgementMessage,
    validateApplication,
    type ISubmittedDocument,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { env } from "../../../../env";
import { requireVerifiedSession } from "../../../../lib/session";
import { INITIAL_STATE, type IFormState } from "./types/form-state.interface";

const DOCUMENT_KINDS = ["REGISTRY", "IDENTITY", "TAX"] as const;

// Le domaine rend des clés complètes ; les catalogues sont lus depuis leur namespace.
// Une clé absente de cette table retombe sur un message générique plutôt que de rendre
// une chaîne brute à l'utilisateur.
const VIOLATION_KEYS: Record<
    string,
    "missing_document" | "duplicate_document" | "document_too_large" | "unsupported_media_type"
> = {
    "errors.vendor_application.missing_document": "missing_document",
    "errors.vendor_application.duplicate_document": "duplicate_document",
    "errors.vendor_application.document_too_large": "document_too_large",
    "errors.vendor_application.unsupported_media_type": "unsupported_media_type",
};

export async function submitApplication(
    _previous: IFormState,
    form: FormData,
): Promise<IFormState> {
    const session = await requireVerifiedSession("/become-a-vendor");
    const t = await getTranslations("errors.vendor_application");
    const tKind = await getTranslations("vendor.documentKind");
    const locale = String(form.get("locale") ?? "fr");

    const fields = applicationSubmissionSchema.safeParse({
        shopName: form.get("shopName"),
        shopDescription: form.get("shopDescription"),
        contactEmail: form.get("contactEmail"),
        contactPhone: form.get("contactPhone"),
        categories: form.getAll("categories"),
        legalForm: form.get("legalForm"),
        legalName: form.get("legalName"),
        registrationNumber: form.get("registrationNumber"),
        taxNumber: form.get("taxNumber") || undefined,
        country: form.get("country"),
        locale,
    });

    if (!fields.success) {
        return {
            ...INITIAL_STATE,
            message: fields.error.issues.map((issue) =>
                t("invalid_field", { field: String(issue.path[0] ?? "") }),
            ),
        };
    }

    const files = DOCUMENT_KINDS.flatMap((kind) => {
        const file = form.get(kind);
        return file instanceof File && file.size > 0 ? [{ kind, file }] : [];
    });

    const submitted: ISubmittedDocument[] = files.map(({ kind, file }) => ({
        kind,
        mimeType: file.type,
        sizeBytes: file.size,
    }));

    // Rien n'est écrit tant que le dossier n'est pas recevable : ni objet dans le bucket,
    // ni ligne en base. Téléverser d'abord laisserait un orphelin par formulaire mal
    // rempli.
    const violations = validateApplication(fields.data, submitted);
    if (violations.length > 0) {
        const message = violations.map((violation) => {
            const key = VIOLATION_KEYS[violation.i18nKey];
            const kind = violation.i18nArgs?.["kind"] as (typeof DOCUMENT_KINDS)[number];
            return key ? t(key, { kind: tKind(kind) }) : t("submit_failed");
        });
        return { ...INITIAL_STATE, message };
    }

    const prefix = randomUUID();
    const uploaded: string[] = [];

    try {
        const documents = [];
        for (const { kind, file } of files) {
            const path = buildObjectPath(prefix, kind, file.name);
            await uploadDocument(path, await file.arrayBuffer(), file.type);
            uploaded.push(path);
            documents.push({
                kind,
                objectPath: path,
                mimeType: file.type,
                sizeBytes: file.size,
                originalName: file.name,
            });
        }

        await createApplication(prisma, {
            applicantId: session.user.id,
            fields: fields.data,
            documents,
        });
    } catch (error) {
        // Compensation : il n'existe pas de transaction commune au stockage et à la base.
        await deleteDocuments(uploaded);
        const duplicate = String(error).includes("vendor_applications_applicant_open_key");
        return { ...INITIAL_STATE, message: [duplicate ? t("already_open") : t("submit_failed")] };
    }

    // Hors transaction : un relais indisponible ne doit pas annuler un dépôt valide.
    const message = buildAcknowledgementMessage(fields.data.shopName, locale);
    await createSmtpSender(env.SMTP_URL, env.EMAIL_FROM).send({
        ...message,
        recipient: session.user.email,
    });

    revalidatePath("/become-a-vendor");
    return { message: [], success: true };
}
