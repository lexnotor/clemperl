import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { E_USER_ROLE } from "../generated/prisma/enums";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
    throw new Error("DATABASE_URL est absente : impossible de peupler la base.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Compte d'administration de développement. `upsert` plutôt que `create` : le seed
// doit pouvoir être rejoué sur une base déjà peuplée sans échouer sur la contrainte
// d'unicité de l'adresse.
async function main(): Promise<void> {
    const admin = await prisma.user.upsert({
        where: { email: "admin@clemperl.test" },
        update: {},
        create: {
            email: "admin@clemperl.test",
            name: "Administration ClemPerl",
            role: E_USER_ROLE.ADMIN,
        },
    });
    console.log(`Compte d'administration prêt : ${admin.email} (${admin.id})`);
}

main()
    .catch((erreur: unknown) => {
        console.error(erreur);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
