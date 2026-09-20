import { randomUUID } from "node:crypto";

// Le nom d'objet est généré. Reprendre celui de l'utilisateur laisserait choisir où le
// fichier atterrit — `../` compris — et ferait collisionner deux dépôts homonymes. Le
// nom d'origine survit en base, pour l'affichage seulement.
export function buildObjectPath(prefix: string, kind: string, originalName: string): string {
    const parts = originalName.split(".");
    const extension =
        parts.length > 1 ? (parts.pop() as string).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    return `${prefix}/${kind}-${randomUUID()}.${extension || "bin"}`;
}
