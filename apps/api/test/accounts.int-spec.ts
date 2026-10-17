import { countAdministrators, prisma } from "@clemperl/db";

// Préfixe propre au fichier : les suites partagent une base qui n'est pas vidée entre deux
// passages, et deux suites qui créent des comptes pareil se marchent dessus.
const PREFIX = "acc";

describe("barrière d'amorçage", () => {
    it("compte les DEUX rôles d'administration : un super_admin seul suffit", async () => {
        // Comparaison par écart : la base est partagée avec d'autres suites, dont l'une
        // porte déjà un `ADMIN`, donc aucun total absolu n'est stable.
        const before = await countAdministrators(prisma);

        const admin = await prisma.user.create({
            data: { email: `${PREFIX}-sa-1@clemperl.test`, emailVerified: true, role: "SUPER_ADMIN" },
        });
        expect(await countAdministrators(prisma)).toBe(before + 1);

        // Compter les seuls `ADMIN` rendrait zéro ici, donc rouvrirait l'amorçage sur l'état
        // que l'amorçage produit lui-même : la plateforme se réinstallerait par-dessus son
        // propre propriétaire.
        await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
        expect(await countAdministrators(prisma)).toBe(before + 1);

        await prisma.user.update({ where: { id: admin.id }, data: { role: "CUSTOMER" } });
        expect(await countAdministrators(prisma)).toBe(before);
    });
});
