import { demarrerBaseDeTest } from "./base-de-test";

// Le seul endroit, avec son équivalent contrat, qui démarre un conteneur. Un
// `new PostgreSqlContainer` dans un fichier de test est une régression, pas une
// commodité locale.
export default async function globalSetup(): Promise<void> {
    process.env["DATABASE_URL_TEST"] = await demarrerBaseDeTest();
}
