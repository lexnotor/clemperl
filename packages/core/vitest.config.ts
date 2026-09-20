// Seuils de couverture : plancher mesuré, jamais souhaité. Il monte, jamais il ne descend.
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            // `include` est indispensable : sans lui, le fournisseur v8 ne mesure que
            // les fichiers effectivement chargés par un test. Un fichier source jamais
            // importé n'apparaît pas dans le rapport, donc le plancher ne le voit pas —
            // et c'est exactement le cas d'un nouveau fichier livré sans test.
            include: ["src/**/*.{ts,tsx}"],
            // L'accès au stockage est couvert par la suite d'INTÉGRATION, qui parle au vrai
            // service depuis le conteneur `api`. Ce qu'il garantit — les politiques du
            // bucket, le refus d'écrasement, les erreurs du client — ne se prouve pas
            // avec un substitut. Le calcul de chemin, lui, est pur et reste mesuré ici.
            exclude: [
                "**/index.ts",
                "**/*.config.ts",
                "**/test-setup.ts",
                "src/utils/document-storage.utils.ts",
            ],
            // Plancher mesuré, pas souhaité.
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
