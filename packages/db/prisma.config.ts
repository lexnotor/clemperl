// Configuration de la CLI Prisma. Depuis Prisma 7, l'URL de connexion utilisée par
// Migrate vit ici et non plus dans le bloc `datasource` du schéma.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: env("DATABASE_URL") },
});
