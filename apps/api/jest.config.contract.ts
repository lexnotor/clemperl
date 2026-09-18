import type { Config } from "jest";
import { transform, transformIgnorePatterns } from "./jest.transform.ts";

// Couche contrat : configuration SÉPARÉE de l'intégration, et ce n'est pas de
// l'esthétique. La bibliothèque qui intercepte le HTTP sortant remplace le module
// `http` pour tout le processus, et Testcontainers parle au démon Docker sur une
// connexion HTTP. Les réunir casse la connexion Docker avec une erreur qui n'évoque en
// rien sa cause. Ces deux couches ne partagent jamais un run.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/src/**/*.contract-spec.ts"],
    moduleFileExtensions: ["ts", "js", "mjs", "json"],
    transform,
    transformIgnorePatterns,
    maxWorkers: 1,
};

export default config;
