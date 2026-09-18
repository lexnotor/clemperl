import type { Config } from "jest";
import { transform, transformIgnorePatterns } from "./jest.transform.ts";

// E2E HTTP de l'API, joué avec supertest contre l'application montée. Les parcours
// navigateur des trois fronts relèvent de Playwright, ailleurs.
const config: Config = {
    rootDir: ".",
    testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
    transform,
    transformIgnorePatterns,
    maxWorkers: 1,
};

export default config;
