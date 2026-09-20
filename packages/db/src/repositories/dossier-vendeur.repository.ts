import type {
    E_VENDOR_CATEGORY,
    E_VENDOR_DECISION,
    E_VENDOR_DOCUMENT_KIND,
    E_VENDOR_REJECTION_REASON,
} from "../../generated/prisma/enums.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

type TCategorie = (typeof E_VENDOR_CATEGORY)[keyof typeof E_VENDOR_CATEGORY];
type TNature = (typeof E_VENDOR_DOCUMENT_KIND)[keyof typeof E_VENDOR_DOCUMENT_KIND];
type TSens = (typeof E_VENDOR_DECISION)[keyof typeof E_VENDOR_DECISION];
type TRaison = (typeof E_VENDOR_REJECTION_REASON)[keyof typeof E_VENDOR_REJECTION_REASON];

export interface IPieceAEnregistrer {
    kind: TNature;
    objectPath: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
}

export interface IChampsDossier {
    locale: string;
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: TCategorie[];
    legalForm: string;
    legalName: string;
    registrationNumber: string;
    taxNumber?: string;
    country: string;
}

export interface ICreationDossier {
    applicantId: string;
    champs: IChampsDossier;
    pieces: IPieceAEnregistrer[];
}

// Le dossier et ses pièces dans la même transaction : un dossier sans justificatifs
// serait irrecevable et occuperait pourtant l'unique place ouverte du candidat.
export async function creerDossier(
    prisma: PrismaClient,
    entree: ICreationDossier,
): Promise<{ id: string }> {
    return prisma.$transaction(async (tx) => {
        const dossier = await tx.vendorApplication.create({
            data: { applicantId: entree.applicantId, submittedAt: new Date(), ...entree.champs },
            select: { id: true },
        });

        await tx.vendorDocument.createMany({
            data: entree.pieces.map((piece) => ({ applicationId: dossier.id, ...piece })),
        });

        return dossier;
    });
}

export interface IResoumissionDossier {
    applicationId: string;
    champs: IChampsDossier;
    pieces: IPieceAEnregistrer[];
}

export async function resoumettreDossier(
    prisma: PrismaClient,
    entree: IResoumissionDossier,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const touchees = await tx.vendorApplication.updateMany({
            where: { id: entree.applicationId, status: "REJECTED" },
            data: { status: "SUBMITTED", submittedAt: new Date(), ...entree.champs },
        });

        if (touchees.count !== 1) {
            throw new Error(ERREUR_DOSSIER_NON_REFUSE);
        }

        // Une resoumission remplace les pièces, elle ne les empile pas : la contrainte
        // d'unicité sur (dossier, nature) rend cet `upsert` non ambigu.
        for (const piece of entree.pieces) {
            await tx.vendorDocument.upsert({
                where: {
                    applicationId_kind: { applicationId: entree.applicationId, kind: piece.kind },
                },
                create: { applicationId: entree.applicationId, ...piece },
                update: piece,
            });
        }
    });
}

export const ERREUR_DOSSIER_DEJA_DECIDE = "DOSSIER_DEJA_DECIDE";
export const ERREUR_DOSSIER_NON_REFUSE = "DOSSIER_NON_REFUSE";

export interface IDecisionDossier {
    applicationId: string;
    decidedById: string;
    decision: TSens;
    reason?: TRaison;
    comment?: string;
    // Dérivé par le domaine et fourni ici : ce package persiste, il n'arbitre pas.
    slug?: string;
}

export async function deciderSurDossier(
    prisma: PrismaClient,
    entree: IDecisionDossier,
): Promise<{ vendorId: string | null }> {
    return prisma.$transaction(async (tx) => {
        // `updateMany` conditionné sur l'état, et non `update` sur l'identifiant : c'est
        // la base qui arbitre la course entre deux administrateurs sur la même fiche.
        const touchees = await tx.vendorApplication.updateMany({
            where: { id: entree.applicationId, status: "SUBMITTED" },
            data: { status: entree.decision, decidedAt: new Date() },
        });

        if (touchees.count !== 1) {
            throw new Error(ERREUR_DOSSIER_DEJA_DECIDE);
        }

        await tx.vendorDecision.create({
            data: {
                applicationId: entree.applicationId,
                decision: entree.decision,
                reason: entree.reason,
                comment: entree.comment,
                decidedById: entree.decidedById,
            },
        });

        if (entree.decision === "REJECTED") {
            return { vendorId: null };
        }

        const dossier = await tx.vendorApplication.findUniqueOrThrow({
            where: { id: entree.applicationId },
        });

        const vendeur = await tx.vendor.create({
            data: {
                // `??` ne suffirait pas : une chaîne vide n'est pas nullish, et elle
                // donnerait un identifiant public vide que la boutique suivante ferait
                // casser sur l'unicité. La validation l'empêche en amont ; ceci tient si
                // un autre appelant arrive un jour.
                slug: entree.slug || dossier.id,
                shopName: dossier.shopName,
                shopDescription: dossier.shopDescription,
                contactEmail: dossier.contactEmail,
                contactPhone: dossier.contactPhone,
                categories: dossier.categories,
                legalForm: dossier.legalForm,
                legalName: dossier.legalName,
                registrationNumber: dossier.registrationNumber,
                taxNumber: dossier.taxNumber,
                country: dossier.country,
                // Le candidat devient propriétaire dans la même écriture : une boutique
                // sans membre serait inaccessible à celui qui vient de l'obtenir.
                members: { create: { userId: dossier.applicantId, role: "OWNER" } },
            },
            select: { id: true },
        });

        await tx.vendorApplication.update({
            where: { id: entree.applicationId },
            data: { vendorId: vendeur.id },
        });

        return { vendorId: vendeur.id };
    });
}

export async function lireDossierDuCandidat(prisma: PrismaClient, applicantId: string) {
    return prisma.vendorApplication.findFirst({
        where: { applicantId },
        orderBy: { createdAt: "desc" },
        include: { documents: true, decisions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
}

// Le plus ancien d'abord : une file se traite dans l'ordre d'arrivée, et trier à
// l'envers condamnerait les dossiers du bas.
export async function listerDossiersSoumis(prisma: PrismaClient) {
    return prisma.vendorApplication.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { submittedAt: "asc" },
        select: { id: true, shopName: true, legalName: true, country: true, submittedAt: true },
    });
}

export async function lireDossierComplet(prisma: PrismaClient, id: string) {
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
