import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const execFileAsync = promisify(execFile);

// UN conteneur pour tout le run, démarré par globalSetup. Un conteneur par fichier
// multiplierait les démarrages à froid, qui sont lents et produisent des échecs
// intermittents sans rapport avec le code testé.
let container: StartedPostgreSqlContainer | undefined;

export async function startTestDatabase(): Promise<string> {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    // L'adresse vient du conteneur lui-même. Depuis un conteneur frère, ce n'est ni
    // `localhost` ni le port publié du PostgreSQL de développement : Testcontainers
    // résout l'hôte joignable et le porte dans cette URI.
    const url = container.getConnectionUri();

    // La base est vide : sans migration, le premier `prisma.user.create` échoue sur une
    // relation inexistante. On déploie les migrations du dépôt plutôt que `db push`,
    // pour que le test porte sur le schéma qui partira en production.
    await execFileAsync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
        // `__dirname` et non `import.meta.url` : l'API compile en CommonJS.
        cwd: resolve(__dirname, "../../../packages/db"),
        env: { ...process.env, DATABASE_URL: url },
    });

    return url;
}

export async function stopTestDatabase(): Promise<void> {
    await container?.stop();
    container = undefined;
}

export function getTestDatabaseUrl(): string {
    const url = process.env["DATABASE_URL_TEST"];
    if (!url) {
        throw new Error(
            "DATABASE_URL_TEST est absente : le globalSetup d'intégration n'a pas tourné, " +
                "ou ce test a été lancé avec la mauvaise configuration Jest.",
        );
    }
    return url;
}
