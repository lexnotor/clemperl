// Parcours navigateur des trois fronts. Les parcours HTTP de l'API relèvent de supertest,
// dans apps/api : deux outils, deux emplacements, aucun recouvrement.
import { defineConfig, devices } from "@playwright/test";

const devHost = process.env["DEV_HOST"] ?? "127-0-0-1.sslip.io";

export default defineConfig({
    testDir: "./e2e",
    reporter: process.env["CI"] ? "github" : "list",
    use: {
        baseURL: `https://${devHost}`,
        // Le contexte par défaut est francophone, comme le marché visé. Sans cela,
        // Chromium annonce `en-US` et next-intl sert l'anglais sur `/` — ce qui est
        // le comportement voulu, mais rend les assertions en français trompeuses.
        locale: "fr-FR",
        // L'autorité mkcert n'est pas dans le magasin du navigateur embarqué.
        ignoreHTTPSErrors: true,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
