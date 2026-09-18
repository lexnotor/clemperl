// Les composants se rendent dans jsdom : il n'y a pas de navigateur ici.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        coverage: {
            provider: "v8",
            // `include` est indispensable : sans lui, le fournisseur v8 ne mesure que
            // les fichiers effectivement chargés par un test. Un fichier source jamais
            // importé n'apparaît pas dans le rapport, donc le plancher ne le voit pas —
            // et c'est exactement le cas d'un nouveau fichier livré sans test.
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["**/index.ts", "**/*.config.ts", "**/test-setup.ts"],
            // Plancher : la couverture MESURÉE le 2026-09-18, pas une valeur souhaitée.
            // Il monte, jamais il ne descend. Ce 100 % est le produit du TDD sur un
            // périmètre réduit — il devra peut-être être desserré quand arrivera du code
            // dont la couverture intégrale n'a pas de valeur.
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
    },
});
