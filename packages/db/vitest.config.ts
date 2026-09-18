// Seuils de couverture : plancher mesuré, jamais souhaité. Il monte, jamais il ne descend.
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            // `include` est indispensable : sans lui, le fournisseur v8 ne mesure que
            // les fichiers effectivement chargés par un test. Un fichier source jamais
            // importé n'apparaît pas dans le rapport, donc le plancher ne le voit pas.
            include: ["src/**/*.ts"],
            exclude: ["**/index.ts"],
            // Plancher : la couverture MESURÉE le 2026-09-18.
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
