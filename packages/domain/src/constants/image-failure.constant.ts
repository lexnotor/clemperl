// Les raisons d'échec vivent ICI, dans le domaine, et non dans `apps/api`. Elles sont
// produites par le worker, rangées en base, lues par l'espace vendeur et traduites par le
// catalogue : quatre endroits pour un vocabulaire. Écrites du seul côté qui les produit,
// elles seraient recopiées à la main partout ailleurs, et une faute de frappe donnerait
// un libellé vide sans que rien n'échoue.
//
// Ce sont des CLÉS de traduction : la base ne range pas du français.
export const IMAGE_FAILURE = {
    objectMissing: "object_missing",
    unreadable: "unreadable",
    tooSmall: "too_small",
    tooLarge: "too_large",
    processingFailed: "processing_failed",
} as const;

export type TImageFailure = (typeof IMAGE_FAILURE)[keyof typeof IMAGE_FAILURE];

// Relancer n'a de sens que si l'original est ENCORE LÀ. Le worker le supprime dès qu'il
// refuse une image — un fichier dont on sait qu'il ne servira jamais n'a pas à occuper
// d'espace — donc pour trois raisons sur cinq, « Réessayer » promet une issue qui
// n'existe plus : le job retrouverait un objet absent et échouerait autrement.
//
// Reste le traitement tombé : stockage injoignable, base coupée, tentatives épuisées.
// L'image était bonne, l'original n'a pas bougé, et relancer aboutit.
export function isRetryableImageFailure(reason: string | null | undefined): boolean {
    return reason === IMAGE_FAILURE.processingFailed;
}
