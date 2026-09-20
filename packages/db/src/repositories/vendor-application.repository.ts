import type {
    E_VENDOR_CATEGORY,
    E_VENDOR_DECISION,
    E_VENDOR_DOCUMENT_KIND,
    E_VENDOR_REJECTION_REASON,
} from "../../generated/prisma/enums.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

type TCategory = (typeof E_VENDOR_CATEGORY)[keyof typeof E_VENDOR_CATEGORY];
type TDocumentKind = (typeof E_VENDOR_DOCUMENT_KIND)[keyof typeof E_VENDOR_DOCUMENT_KIND];
type TDecisionOutcome = (typeof E_VENDOR_DECISION)[keyof typeof E_VENDOR_DECISION];
type TRejectionReason =
    (typeof E_VENDOR_REJECTION_REASON)[keyof typeof E_VENDOR_REJECTION_REASON];

export const ERROR_APPLICATION_ALREADY_DECIDED = "APPLICATION_ALREADY_DECIDED";
export const ERROR_APPLICATION_NOT_REJECTED = "APPLICATION_NOT_REJECTED";

export interface IDocumentToStore {
    kind: TDocumentKind;
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
}

export interface IApplicationFields {
    locale: string;
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: TCategory[];
    legalForm: string;
    legalName: string;
    registrationNumber: string;
    taxNumber?: string;
    country: string;
}

export interface ICreateApplication {
    applicantId: string;
    fields: IApplicationFields;
    documents: IDocumentToStore[];
}

// Le dossier et ses pièces dans la même transaction : un dossier sans justificatifs
// serait irrecevable et occuperait pourtant l'unique place ouverte du candidat.
export async function createApplication(
    prisma: PrismaClient,
    input: ICreateApplication,
): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
        const application = await tx.vendorApplication.create({
            data: { applicantId: input.applicantId, submittedAt: new Date(), ...input.fields },
            select: { id: true },
        });

        await tx.vendorDocument.createMany({
            data: input.documents.map((document) => ({
                applicationId: application.id,
                ...document,
            })),
        });

        return application;
    });
}

export interface IResubmitApplication {
    applicationId: string;
    fields: IApplicationFields;
    documents: IDocumentToStore[];
}

export async function resubmitApplication(
    prisma: PrismaClient,
    input: IResubmitApplication,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const updated = await tx.vendorApplication.updateMany({
            where: { id: input.applicationId, status: "REJECTED" },
            data: { status: "SUBMITTED", submittedAt: new Date(), ...input.fields },
        });

        if (updated.count !== 1) {
            throw new Error(ERROR_APPLICATION_NOT_REJECTED);
        }

        // Une resoumission remplace les pièces, elle ne les empile pas : la contrainte
        // d'unicité sur (dossier, nature) rend cet `upsert` non ambigu.
        for (const document of input.documents) {
            await tx.vendorDocument.upsert({
                where: {
                    applicationId_kind: {
                        applicationId: input.applicationId,
                        kind: document.kind,
                    },
                },
                create: { applicationId: input.applicationId, ...document },
                update: document,
            });
        }
    });
}

export interface IApplicationDecision {
    applicationId: string;
    decidedById: string;
    outcome: TDecisionOutcome;
    reason?: TRejectionReason;
    comment?: string;
    // Dérivé par le domaine et fourni ici : ce package persiste, il n'arbitre pas.
    slug?: string;
}

export async function decideOnApplication(
    prisma: PrismaClient,
    input: IApplicationDecision,
): Promise<{ vendorId: string | null }> {
    return prisma.$transaction(async (tx) => {
        // `updateMany` conditionné sur l'état, et non `update` sur l'identifiant : c'est
        // la base qui arbitre la course entre deux administrateurs sur la même fiche.
        const updated = await tx.vendorApplication.updateMany({
            where: { id: input.applicationId, status: "SUBMITTED" },
            data: { status: input.outcome, decidedAt: new Date() },
        });

        if (updated.count !== 1) {
            throw new Error(ERROR_APPLICATION_ALREADY_DECIDED);
        }

        await tx.vendorDecision.create({
            data: {
                applicationId: input.applicationId,
                decision: input.outcome,
                reason: input.reason,
                comment: input.comment,
                decidedById: input.decidedById,
            },
        });

        if (input.outcome === "REJECTED") {
            return { vendorId: null };
        }

        const application = await tx.vendorApplication.findUniqueOrThrow({
            where: { id: input.applicationId },
        });

        const vendor = await tx.vendor.create({
            data: {
                slug: input.slug ?? application.id,
                shopName: application.shopName,
                shopDescription: application.shopDescription,
                contactEmail: application.contactEmail,
                contactPhone: application.contactPhone,
                categories: application.categories,
                legalForm: application.legalForm,
                legalName: application.legalName,
                registrationNumber: application.registrationNumber,
                taxNumber: application.taxNumber,
                country: application.country,
                // Le candidat devient propriétaire dans la même écriture : une boutique
                // sans membre serait inaccessible à celui qui vient de l'obtenir.
                members: { create: { userId: application.applicantId, role: "OWNER" } },
            },
            select: { id: true },
        });

        await tx.vendorApplication.update({
            where: { id: input.applicationId },
            data: { vendorId: vendor.id },
        });

        return { vendorId: vendor.id };
    });
}

export async function readApplicantApplication(prisma: PrismaClient, applicantId: string) {
    return prisma.vendorApplication.findFirst({
        where: { applicantId },
        orderBy: { createdAt: "desc" },
        include: { documents: true, decisions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
}

// Le plus ancien d'abord : une file se traite dans l'ordre d'arrivée, et trier à
// l'envers condamnerait les dossiers du bas.
export async function listSubmittedApplications(prisma: PrismaClient) {
    return prisma.vendorApplication.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { submittedAt: "asc" },
        select: { id: true, shopName: true, legalName: true, country: true, submittedAt: true },
    });
}

export async function readFullApplication(prisma: PrismaClient, id: string) {
    return prisma.vendorApplication.findUnique({
        where: { id },
        include: {
            applicant: { select: { id: true, email: true, name: true } },
            documents: true,
            decisions: {
                orderBy: { createdAt: "desc" },
                include: { decidedBy: { select: { id: true, email: true } } },
            },
        },
    });
}
