"use server";

import { randomUUID } from "node:crypto";
import {
    buildObjectPath,
    createSmtpSender,
    deleteDocuments,
    uploadDocument,
} from "@clemperl/core";
import {
    createApplication,
    prisma,
    readApplicantApplication,
    resubmitApplication,
    type IDocumentToStore,
} from "@clemperl/db";
import {
    applicationSubmissionSchema,
    buildAcknowledgementMessage,
    canResubmit,
    validateApplication,
    type TApplicationSubmission,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { env } from "../../../../env";
import { requireVerifiedSession } from "../../../../lib/session";
import { INITIAL_STATE, type IFormState } from "./types/form-state.interface";

const DOCUMENT_KINDS = ["REGISTRY", "IDENTITY", "TAX"] as const;
type TDocumentKind = (typeof DOCUMENT_KINDS)[number];

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

type TTranslate = Awaited<ReturnType<typeof getTranslations>>;

interface IPreparedSubmission {
    message: string[];
    fields?: TApplicationSubmission;
    documents: IDocumentToStore[];
    uploaded: string[];
    replacedKinds: TDocumentKind[];
}

// Analyse, validation et téléversement, partagés par le dépôt et la resoumission.
// Recopier cette séquence dans les deux actions la ferait diverger à la première règle
// ajoutée, et la divergence serait silencieuse : chaque copie resterait valide seule.
//
// Rien n'est téléversé tant que le dossier n'est pas recevable — sinon chaque formulaire
// mal rempli laisserait un orphelin dans le bucket.
//
// `alreadyOnFile` porte les natures déjà déposées : à une resoumission, le candidat ne
// redépose que la pièce en cause, et sans elles la validation compterait les autres
// comme manquantes.
async function prepareSubmission(
    form: FormData,
    t: TTranslate,
    tKind: TTranslate,
    alreadyOnFile: readonly TDocumentKind[] = [],
): Promise<IPreparedSubmission> {
    const vide = { message: [] as string[], documents: [], uploaded: [], replacedKinds: [] };

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
        locale: String(form.get("locale") ?? "fr"),
    });

    if (!fields.success) {
        return {
            ...vide,
            message: fields.error.issues.map((issue) =>
                t("invalid_field", { field: String(issue.path[0] ?? "") }),
            ),
        };
    }

    const files = DOCUMENT_KINDS.flatMap((kind) => {
        const file = form.get(kind);
        return file instanceof File && file.size > 0 ? [{ kind, file }] : [];
    });

    const submitted = files.map(({ kind, file }) => ({
        kind,
        mimeType: file.type,
        sizeBytes: file.size,
    }));

    // Les pièces conservées sont réputées valides : elles ont déjà passé cette
    // validation à leur dépôt. Seul leur genre compte ici, pour que les obligatoires
    // soient vues comme présentes.
    const kept = alreadyOnFile
        .filter((kind) => !files.some((file) => file.kind === kind))
        .map((kind) => ({ kind, mimeType: "application/pdf", sizeBytes: 0 }));

    const violations = validateApplication(fields.data, [...kept, ...submitted]);

    if (violations.length > 0) {
        const message = violations.map((violation) => {
            const key = VIOLATION_KEYS[violation.i18nKey];
            const kind = violation.i18nArgs?.["kind"] as TDocumentKind;
            return key ? t(key, { kind: tKind(kind) }) : t("submit_failed");
        });
        return { ...vide, message };
    }

    const prefix = randomUUID();
    const documents: IDocumentToStore[] = [];
    const uploaded: string[] = [];

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

    return {
        message: [],
        fields: fields.data,
        documents,
        uploaded,
        replacedKinds: files.map(({ kind }) => kind),
    };
}

async function sendAcknowledgement(
    shopName: string,
    locale: string,
    recipient: string,
): Promise<void> {
    // Hors transaction : un relais indisponible ne doit pas annuler un dépôt valide.
    const message = buildAcknowledgementMessage(shopName, locale);
    await createSmtpSender(env.SMTP_URL, env.EMAIL_FROM).send({ ...message, recipient });
}

export async function submitApplication(
    _previous: IFormState,
    form: FormData,
): Promise<IFormState> {
    const session = await requireVerifiedSession("/become-a-vendor");
    const t = await getTranslations("errors.vendor_application");
    const tKind = await getTranslations("vendor.documentKind");

    const prepared = await prepareSubmission(form, t, tKind);
    if (prepared.fields === undefined) {
        return { ...INITIAL_STATE, message: prepared.message };
    }

    try {
        await createApplication(prisma, {
            applicantId: session.user.id,
            fields: prepared.fields,
            documents: prepared.documents,
        });
    } catch (error) {
        // Compensation : il n'existe pas de transaction commune au stockage et à la base.
        await deleteDocuments(prepared.uploaded);
        const duplicate = String(error).includes("vendor_applications_applicant_open_key");
        return { ...INITIAL_STATE, message: [duplicate ? t("already_open") : t("submit_failed")] };
    }

    await sendAcknowledgement(prepared.fields.shopName, prepared.fields.locale, session.user.email);
    revalidatePath("/[locale]/become-a-vendor", "page");
    return { message: [], success: true };
}

export async function resubmitApplicationAction(
    _previous: IFormState,
    form: FormData,
): Promise<IFormState> {
    const session = await requireVerifiedSession("/become-a-vendor");
    const t = await getTranslations("errors.vendor_application");
    const tKind = await getTranslations("vendor.documentKind");
    const applicationId = String(form.get("applicationId") ?? "");

    const application = await readApplicantApplication(prisma, session.user.id);

    // La permission est demandée au domaine et non réécrite ici : c'est lui qui sait que
    // seul un dossier refusé se resoumet, et il le sait par la table des transitions.
    if (
        application === null ||
        application.id !== applicationId ||
        !canResubmit(
            { id: session.user.id, role: session.user.role as "CUSTOMER" | "ADMIN" },
            { applicantId: application.applicantId, status: application.status },
        )
    ) {
        return { ...INITIAL_STATE, message: [t("not_resubmittable")] };
    }

    const prepared = await prepareSubmission(
        form,
        t,
        tKind,
        application.documents.map((document) => document.kind),
    );
    if (prepared.fields === undefined) {
        return { ...INITIAL_STATE, message: prepared.message };
    }

    // Seules les pièces effectivement redéposées remplacent les anciennes ; celles que le
    // candidat n'a pas retouchées restent au dossier.
    const replaced = application.documents
        .filter((document) => prepared.replacedKinds.includes(document.kind))
        .map((document) => document.objectPath);

    try {
        await resubmitApplication(prisma, {
            applicationId,
            fields: prepared.fields,
            documents: prepared.documents,
        });
    } catch {
        await deleteDocuments(prepared.uploaded);
        return { ...INITIAL_STATE, message: [t("submit_failed")] };
    }

    // APRÈS le commit, jamais avant : supprimer d'abord perdrait des pièces encore
    // référencées si la transaction échouait.
    await deleteDocuments(replaced);

    await sendAcknowledgement(prepared.fields.shopName, prepared.fields.locale, session.user.email);
    revalidatePath("/[locale]/become-a-vendor", "page");
    return { message: [], success: true };
}
