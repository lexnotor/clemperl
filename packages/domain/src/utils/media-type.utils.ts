// Une LISTE BLANCHE, et non « ça commence par image/ ». La différence n'est pas
// cosmétique : `image/svg+xml` satisfait le préfixe, sharp le décode sans se plaindre,
// et un SVG n'est pas une image — c'est un document XML qui exécute du script. Un
// contrôle par préfixe accepte donc tout ce qu'on n'a pas pensé à interdire, et la liste
// des formats qu'un navigateur sait exécuter s'allonge sans nous prévenir.
//
// Ces quatre-là sont exactement ce que le worker sait décliner et ce que la boutique
// sert. En ajouter un demande de vérifier les deux.
export const ACCEPTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
] as const;

export function isAcceptedImageType(mimeType: string): boolean {
    // Le navigateur écrit parfois `IMAGE/JPEG`, parfois avec un paramètre. Seule
    // l'essence compte, et elle se lit AVANT le premier point-virgule : comparer la
    // chaîne entière refuserait une photo valable, et lire après laisserait passer un
    // type caché derrière un paramètre.
    const separateur = mimeType.indexOf(";");
    const essence = (separateur === -1 ? mimeType : mimeType.slice(0, separateur))
        .trim()
        .toLowerCase();
    return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(essence);
}
