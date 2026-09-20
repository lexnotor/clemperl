import { randomUUID } from "node:crypto";

// Le nom d'objet est généré. Reprendre celui de l'utilisateur laisserait choisir où le
// fichier atterrit — `../` compris — et ferait collisionner deux dépôts homonymes. Le
// nom d'origine survit en base, pour l'affichage seulement.
export function construireCheminObjet(
    prefixe: string,
    nature: string,
    nomOrigine: string,
): string {
    const morceaux = nomOrigine.split(".");
    const extension =
        morceaux.length > 1
            ? (morceaux.pop() as string).toLowerCase().replace(/[^a-z0-9]/g, "")
            : "";
    return `${prefixe}/${nature}-${randomUUID()}.${extension || "bin"}`;
}
