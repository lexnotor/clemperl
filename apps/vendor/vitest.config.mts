// Deux couches cohabitent ici. Les actions serveur et les routes tournent sous Node, comme
// en production ; les composants client se rendent dans jsdom, qu'ils demandent fichier par
// fichier par `// @vitest-environment jsdom`. Un jsdom global passerait ses propres `File`,
// `FormData` et `Blob` sous le code serveur, qui ne les rencontre jamais en vrai.
//
// `.mts` et non `.ts` : l'application n'est pas déclarée module ES dans son `package.json`,
// et Vite chargerait ce fichier comme du CommonJS, en le signalant à chaque lancement.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        setupFiles: ["./src/test-setup.ts"],
    },
});
