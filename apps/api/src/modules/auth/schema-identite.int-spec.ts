import { prisma } from "@clemperl/db";

// Vérifie contre une base RÉELLE que les contraintes du schéma d'identité tiennent :
// un substitut en mémoire ne reproduit ni l'unicité, ni les types énumérés PostgreSQL.
describe("schéma d'identité", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("refuse deux comptes avec la même adresse", async () => {
        // L'unicité de l'adresse est ce qui empêche deux personnes de revendiquer le
        // même compte. Sans ce test, une migration qui perdrait la contrainte ne se
        // verrait qu'en production.
        const email = "doublon@clemperl.test";
        await prisma.user.create({ data: { email, name: "Premier" } });

        await expect(prisma.user.create({ data: { email, name: "Second" } })).rejects.toThrow();
    });

    it("refuse un rôle absent du type énuméré", async () => {
        // Le rôle décide de ce qu'un compte peut faire. PostgreSQL rejette lui-même une
        // valeur hors énumération : c'est cette barrière-là qu'on vérifie, pas celle de
        // TypeScript, qui a disparu à l'exécution.
        await expect(
            prisma.$executeRawUnsafe(
                `INSERT INTO "user" (id, email, role, created_at, updated_at)
                 VALUES ('rôle-invalide', 'role@clemperl.test', 'SUPERVISEUR', NOW(), NOW())`,
            ),
        ).rejects.toThrow();
    });
});
