import { E_ACTION_DOSSIER } from "../constants/index.js";
import type { TStatutDossier } from "../types/index.js";
import { peutTransitionner } from "./transitions-dossier.utils.js";

interface IActeur {
    id: string;
    role: "CUSTOMER" | "ADMIN";
}

export function peutVoirDossier(acteur: IActeur, dossier: { applicantId: string }): boolean {
    return acteur.role === "ADMIN" || acteur.id === dossier.applicantId;
}

export function peutDecider(acteur: IActeur): boolean {
    return acteur.role === "ADMIN";
}

// La question « l'état autorise-t-il ? » est déléguée à la machine à états : réécrire
// `status === "REJECTED"` ici créerait une seconde vérité à tenir synchrone.
export function peutResoumettre(
    acteur: IActeur,
    dossier: { applicantId: string; status: TStatutDossier },
): boolean {
    return (
        acteur.id === dossier.applicantId &&
        peutTransitionner(dossier.status, E_ACTION_DOSSIER.RESOUMETTRE)
    );
}

export function estMembreDe(
    membres: readonly { userId: string }[],
    utilisateurId: string,
): boolean {
    return membres.some((membre) => membre.userId === utilisateurId);
}
