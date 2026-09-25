import { randomUUID } from "node:crypto";

// SÉPARÉ de `media-path.utils.ts` à cause de cet import. `node:crypto` n'existe pas dans
// un navigateur, et ce fichier ne part donc PAS dans `browser.ts` : seul le serveur
// construit un chemin d'original, au moment où la server action reçoit le fichier.

// Le chemin est GÉNÉRÉ, jamais repris du fichier déposé : reprendre celui-ci laisserait
// choisir où l'objet atterrit — `../` compris — et ferait collisionner deux dépôts
// homonymes. Le nom d'origine survit en base, pour l'affichage seulement.
//
// Un `uuid` par dépôt rend aussi le chemin IMMUABLE : rien n'est jamais réécrit, ce qui
// autorise un cache d'un an sans invalidation.
export function buildOriginalPath(productId: string, originalName: string): string {
    const parts = originalName.split(".");
    const extension =
        parts.length > 1 ? (parts.pop() as string).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    return `${productId}/${randomUUID()}/original.${extension || "bin"}`;
}
