"use server";

import { randomUUID } from "node:crypto";
import {
    construireCheminObjet,
    creerSmtpSender,
    supprimerPieces,
    televerserPiece,
} from "@clemperl/core";
import { creerDossier, prisma } from "@clemperl/db";
import {
    construireMessageAccuseReception,
    schemaDepotDossier,
    validerDossier,
    type IPieceDeposee,
} from "@clemperl/domain";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { env } from "../../../../env";
import { lireSessionVerifiee } from "../../../../lib/session";
import { ETAT_INITIAL, type IEtatFormulaire } from "./types/etat-formulaire.interface";

const NATURES = ["REGISTRY", "IDENTITY", "TAX"] as const;

// Le domaine rend des clés complètes ; les catalogues sont lus depuis leur namespace.
// Une clé absente de cette table retombe sur un message générique plutôt que de rendre
// une chaîne brute à l'utilisateur.
const CLES_VIOLATION: Record<
    string,
    "missing_document" | "duplicate_document" | "document_too_large" | "unsupported_media_type"
> = {
    "errors.vendor_application.missing_document": "missing_document",
    "errors.vendor_application.duplicate_document": "duplicate_document",
    "errors.vendor_application.document_too_large": "document_too_large",
    "errors.vendor_application.unsupported_media_type": "unsupported_media_type",
} as const;

export async function deposerDossier(
    _precedent: IEtatFormulaire,
    donnees: FormData,
): Promise<IEtatFormulaire> {
    const session = await lireSessionVerifiee("/devenir-vendeur");
    const t = await getTranslations("errors.vendor_application");
    const tPiece = await getTranslations("vendeur.piece");
    const locale = String(donnees.get("locale") ?? "fr");

    const champs = schemaDepotDossier.safeParse({
        shopName: donnees.get("shopName"),
        shopDescription: donnees.get("shopDescription"),
        contactEmail: donnees.get("contactEmail"),
        contactPhone: donnees.get("contactPhone"),
        categories: donnees.getAll("categories"),
        legalForm: donnees.get("legalForm"),
        legalName: donnees.get("legalName"),
        registrationNumber: donnees.get("registrationNumber"),
        taxNumber: donnees.get("taxNumber") || undefined,
        country: donnees.get("country"),
        locale,
    });

    if (!champs.success) {
        return {
            ...ETAT_INITIAL,
            message: champs.error.issues.map((souci) =>
                t("invalid_field", { champ: String(souci.path[0] ?? "") }),
            ),
        };
    }

    const fichiers = NATURES.flatMap((nature) => {
        const fichier = donnees.get(nature);
        return fichier instanceof File && fichier.size > 0 ? [{ nature, fichier }] : [];
    });

    const deposees: IPieceDeposee[] = fichiers.map(({ nature, fichier }) => ({
        kind: nature,
        mimeType: fichier.type,
        sizeBytes: fichier.size,
    }));

    // Rien n'est écrit tant que le dossier n'est pas recevable : ni objet dans le bucket,
    // ni ligne en base. Téléverser d'abord laisserait un orphelin par formulaire mal
    // rempli.
    const violations = validerDossier(champs.data, deposees);
    if (violations.length > 0) {
        const message = violations.map((violation) => {
            const cle = CLES_VIOLATION[violation.i18nKey];
            const nature = violation.i18nArgs?.["nature"] as (typeof NATURES)[number];
            return cle ? t(cle, { nature: tPiece(nature) }) : t("submit_failed");
        });
        return { ...ETAT_INITIAL, message };
    }

    const prefixe = randomUUID();
    const televersees: string[] = [];

    try {
        const pieces = [];
        for (const { nature, fichier } of fichiers) {
            const chemin = construireCheminObjet(prefixe, nature, fichier.name);
            await televerserPiece(chemin, await fichier.arrayBuffer(), fichier.type);
            televersees.push(chemin);
            pieces.push({
                kind: nature,
                objectPath: chemin,
                mimeType: fichier.type,
                sizeBytes: fichier.size,
                originalName: fichier.name,
            });
        }

        await creerDossier(prisma, {
            applicantId: session.user.id,
            champs: champs.data,
            pieces,
        });
    } catch (erreur) {
        // Compensation : il n'existe pas de transaction commune au stockage et à la base.
        await supprimerPieces(televersees);
        const doublon = String(erreur).includes("vendor_applications_applicant_open_key");
        return { ...ETAT_INITIAL, message: [doublon ? t("already_open") : t("submit_failed")] };
    }

    // Hors transaction : un relais indisponible ne doit pas annuler un dépôt valide.
    const message = construireMessageAccuseReception(champs.data.shopName, locale);
    await creerSmtpSender(env.SMTP_URL, env.EMAIL_FROM).envoyer({
        ...message,
        destinataire: session.user.email,
    });

    revalidatePath("/devenir-vendeur");
    return { message: [], succes: true };
}
