import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
    throw new Error("DATABASE_URL est absente : impossible de peupler la base.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Ce seed ne crée AUCUN utilisateur. Le premier administrateur naît par la page
// d'amorçage de `apps/admin`, qui n'existe que tant qu'aucun compte ne porte le rôle
// `ADMIN`. Semer un compte reviendrait soit à écrire un mot de passe dans le dépôt,
// soit à produire une ligne sans identifiants — donc un compte avec lequel personne ne
// peut se connecter.
//
// Le script reste en place : il accueillera les données de référence du catalogue.
async function main(): Promise<void> {
    console.log("Aucune donnée à semer : l'administration s'amorce par /setup.");
}

main()
    .catch((erreur: unknown) => {
        console.error(erreur);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
