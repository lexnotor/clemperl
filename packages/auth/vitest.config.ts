import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            // `include` est indispensable : sans lui, v8 ne mesure que les fichiers
            // chargés par un test, et un fichier source jamais importé échappe au
            // plancher — précisément le cas d'un nouveau fichier livré sans test.
            include: ["src/**/*.ts"],
            exclude: ["**/index.ts", "**/*.config.ts"],
            // Plancher inscrit à la tâche 10, avec la valeur mesurée.
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
