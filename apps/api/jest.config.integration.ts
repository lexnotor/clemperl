import type { Config } from "jest";
import { transform, transformIgnorePatterns } from "./jest.transform.ts";

// Couche lourde : un conteneur PostgreSQL démarré UNE fois pour tout le run par
// globalSetup, chaque fichier y créant sa propre base logique. Les fichiers référencés
// arrivent en T1, avec la première couche d'intégration.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.int-spec.ts"],
    moduleFileExtensions: ["ts", "js", "mjs", "json"],
    transform,
    transformIgnorePatterns,
    maxWorkers: 1,
    globalSetup: "<rootDir>/test/global-setup-integration.ts",
    globalTeardown: "<rootDir>/test/global-teardown-integration.ts",
    setupFiles: ["<rootDir>/test/setup-integration.ts"],
    // Large, parce qu'un premier démarrage télécharge l'image PostgreSQL.
    testTimeout: 120_000,
};

export default config;
