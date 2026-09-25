import type { Config } from "jest";
import { transform, transformIgnorePatterns } from "./jest.transform.ts";

// Couche unitaire : rapide, jouée à chaque modification. Les modules de câblage, les
// barrels et le point d'entrée sont exclus de la couverture — aucun test ne peut les
// relever, et un pourcentage qu'on ne peut pas faire bouger cesse d'être un objectif.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.spec.ts"],
    moduleFileExtensions: ["ts", "js", "mjs", "json"],
    transform,
    transformIgnorePatterns,
    // Plancher : la couverture MESURÉE. Il monte, jamais il ne descend — un plancher
    // qui baisse est un plancher qu'on a contourné.
    coverageThreshold: {
        global: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/index.ts",
        "!src/**/*.module.ts",
        "!src/main.ts",
        // Les couches intégration et contrat sont colocalisées dans `src/`, mais leurs
        // fichiers ne correspondent pas au `testMatch` d'ici : Jest ne les reconnaît
        // donc pas comme des tests et les compterait comme du code jamais couvert.
        "!src/**/*-spec.ts",
        // Le processeur parle à un service réseau, à une base et à un binaire natif. Ce
        // qu'il garantit — l'ordre des écritures, la suppression d'un objet refusé, le
        // silence sur un produit supprimé — ne se prouve pas avec des substituts, et il
        // l'est par `apps/api/test/product-image-worker.int-spec.ts`, contre le vrai
        // stockage. La DÉCISION qu'il applique, elle, est pure et reste mesurée ici.
        "!src/modules/media/processors/*.ts",
    ],
};

export default config;
