import { lireDossierDuCandidat, prisma } from "@clemperl/db";
import { getTranslations } from "next-intl/server";
import type { JSX } from "react";
import { lireSessionVerifiee } from "../../../../lib/session";
import { DossierAccepte } from "./components/dossier-accepte";
import { DossierEnExamen } from "./components/dossier-en-examen";
import { FormulaireDossier } from "./components/formulaire-dossier";

// Une seule adresse, plusieurs états. Deux routes obligeraient un lien de navigation à
// deviner laquelle proposer, et l'une des deux répondrait « rien à voir ici ».
export default async function DevenirVendeurPage(): Promise<JSX.Element> {
    const session = await lireSessionVerifiee("/devenir-vendeur");
    const t = await getTranslations("vendeur.dossier");
    const dossier = await lireDossierDuCandidat(prisma, session.user.id);

    if (dossier?.status === "ACCEPTED") {
        return <DossierAccepte nomBoutique={dossier.shopName} />;
    }

    if (dossier?.status === "SUBMITTED") {
        return <DossierEnExamen depuis={dossier.submittedAt} />;
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-16">
            <h1 className="text-2xl font-semibold">{t("titre")}</h1>
            <p className="mt-4 text-sm opacity-80">{t("piecesAPreparer")}</p>
            <FormulaireDossier />
        </main>
    );
}
