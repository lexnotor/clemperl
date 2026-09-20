// Parcours navigateur des trois fronts. Les parcours HTTP de l'API relèvent de supertest,
// dans apps/api : deux outils, deux emplacements, aucun recouvrement.
//
// Les applications sont jointes directement, chacune sur son port : pas de proxy, pas de
// TLS, donc pas de certificat que le navigateur de test devrait accepter.
import { defineConfig, devices } from "@playwright/test";

export const URL_STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "http://localhost:3000";
export const URL_VENDOR = process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "http://localhost:3001";
export const URL_ADMIN = process.env["NEXT_PUBLIC_ADMIN_URL"] ?? "http://localhost:3002";
export const URL_MAILPIT = process.env["MAILPIT_URL"] ?? "http://localhost:8025";

export default defineConfig({
    testDir: "./e2e",

    // Visite chaque route une fois : en développement, Next les compile au premier accès,
    // et une pile qui vient de démarrer ferait sinon échouer des tests sains.
    globalSetup: "./e2e/global-setup.ts",

    // Ces parcours traversent plusieurs applications et une boîte de courriels ; le
    // défaut de 30 s est taillé pour un test d'écran.
    timeout: 90_000,


    reporter: process.env["CI"] ? "github" : "list",
    use: {
        baseURL: URL_STOREFRONT,
        // Le contexte par défaut est francophone, comme le marché visé. Sans cela,
        // Chromium annonce `en-US` et next-intl sert l'anglais sur `/` — ce qui est le
        // comportement voulu, mais rend les assertions en français trompeuses.
        locale: "fr-FR",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
