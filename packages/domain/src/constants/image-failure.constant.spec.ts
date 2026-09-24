import { describe, expect, it } from "vitest";
import { IMAGE_FAILURE, isRetryableImageFailure } from "./image-failure.constant.js";

describe("isRetryableImageFailure", () => {
    // Le worker SUPPRIME l'original quand il le refuse : le fichier ne servira jamais, et
    // le garder coûterait de l'espace pour rien. Proposer « Réessayer » ensuite promet
    // une issue qui n'existe plus — le job retrouverait un objet absent et échouerait
    // pour une autre raison.
    it("refuse de relancer ce dont l'original a été supprimé", () => {
        for (const reason of [
            IMAGE_FAILURE.unreadable,
            IMAGE_FAILURE.tooSmall,
            IMAGE_FAILURE.tooLarge,
        ]) {
            expect(isRetryableImageFailure(reason)).toBe(false);
        }
    });

    // Le dépôt n'a jamais abouti : il n'y a rien à relancer non plus.
    it("refuse de relancer un dépôt qui n'a pas abouti", () => {
        expect(isRetryableImageFailure(IMAGE_FAILURE.objectMissing)).toBe(false);
    });

    // LE seul cas où relancer a un sens : l'image était bonne, c'est le traitement qui
    // est tombé — stockage injoignable, base coupée. L'original est toujours là.
    it("accepte de relancer un traitement tombé", () => {
        expect(isRetryableImageFailure(IMAGE_FAILURE.processingFailed)).toBe(true);
    });

    it("refuse une raison inconnue ou absente", () => {
        expect(isRetryableImageFailure("inventée")).toBe(false);
        expect(isRetryableImageFailure(null)).toBe(false);
    });
});
