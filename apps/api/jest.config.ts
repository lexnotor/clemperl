import type { Config } from "jest";
import { transform, transformIgnorePatterns } from "./jest.transform.ts";

// Couche unitaire : rapide, jouée à chaque modification. Les modules de câblage, les
// barrels et le point d'entrée sont exclus de la couverture — aucun test ne peut les
// relever, et un pourcentage qu'on ne peut pas faire bouger cesse d'être un objectif.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.spec.ts"],
    transform,
    transformIgnorePatterns,
    // Plancher : la couverture MESURÉE le 2026-09-18, pas une valeur souhaitée.
    // Il monte, jamais il ne descend.
    coverageThreshold: {
        global: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/index.ts",
        "!src/**/*.module.ts",
        "!src/main.ts",
    ],
};

export default config;
