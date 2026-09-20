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
            // Les repositories sont couverts par la suite d'INTÉGRATION, qui tourne sous
            // Jest dans le conteneur `api` contre un vrai PostgreSQL. Ce que ces
            // fonctions garantissent — un index partiel, une course entre deux écritures,
            // l'atomicité d'une transaction — ne se prouve pas avec un client simulé.
            // Les laisser dans ce rapport imposerait de baisser le plancher, ce que le
            // cliquet interdit.
            exclude: ["**/index.ts", "src/repositories/**"],
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
