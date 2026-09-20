// Seuils de couverture : plancher mesuré, jamais souhaité. Il monte, jamais il ne descend.
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            // Sans `include`, le fournisseur v8 ne mesure que les fichiers chargés par un
            // test : un fichier livré sans test n'apparaîtrait pas dans le rapport.
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["**/index.ts", "**/*.config.ts"],
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
