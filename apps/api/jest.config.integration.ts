import type { Config } from "jest";
import { transform, transformIgnorePatterns } from "./jest.transform.ts";

// Couche lourde : un conteneur PostgreSQL démarré UNE fois pour tout le run par
// globalSetup, chaque fichier y créant sa propre base logique. Les fichiers référencés
// arrivent en T1, avec la première couche d'intégration.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.int-spec.ts"],
    transform,
    transformIgnorePatterns,
    maxWorkers: 1,
};

export default config;
