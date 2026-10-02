// Parcours navigateur des trois fronts. Les parcours HTTP de l'API relèvent de supertest,
// dans apps/api : deux outils, deux emplacements, aucun recouvrement.
//
// Les applications sont jointes directement, chacune sur son port : pas de proxy, pas de
// TLS, donc pas de certificat que le navigateur de test devrait accepter.
import { defineConfig, devices } from "@playwright/test";

// Les URL viennent du `.env`, qui est aussi ce que le compose lit pour publier les ports.
// Sans cette lecture, la configuration retombait sur ses valeurs par défaut, et un port
// déplacé dans `.env` envoyait la suite vers ce qui écoute à l'ancienne adresse, y compris
// un conteneur d'un AUTRE projet. L'échec ne ressemble alors pas à une erreur de
// configuration : les pages répondent, elles ne sont simplement pas les nôtres.
//
// `loadEnvFile` est natif depuis Node 20.12 : aucune dépendance. Il LÈVE si le fichier
// n'existe pas, ce qui est le cas en intégration continue, où les variables sont posées
// par le workflow, donc l'absence est un cas normal, pas une panne.
try {
    process.loadEnvFile(".env");
} catch {
    // Pas de `.env` : les variables viennent de l'environnement, ou les défauts jouent.
}

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
        // Chromium annonce `en-US` et next-intl sert l'anglais sur `/`, ce qui est le
        // comportement voulu, mais rend les assertions en français trompeuses.
        locale: "fr-FR",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
