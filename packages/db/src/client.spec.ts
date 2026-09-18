import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ces tests portent sur le MOMENT où le client se construit, pas sur ce qu'il fait.
// Aucune base n'est jointe : c'est justement le sujet.
describe("client Prisma", () => {
    const environnementInitial = process.env["DATABASE_URL"];

    beforeEach(() => {
        // Chaque test repart d'un module neuf : l'instance est mémorisée, et un test
        // hériterait sinon de celle qu'un autre a construite.
        vi.resetModules();
        delete (globalThis as { prisma?: unknown }).prisma;
    });

    afterEach(() => {
        if (environnementInitial === undefined) {
            delete process.env["DATABASE_URL"];
        } else {
            process.env["DATABASE_URL"] = environnementInitial;
        }
    });

    it("s'importe sans DATABASE_URL", async () => {
        // `next build` charge le module de chaque page pour y lire sa configuration de
        // rendu. Une construction à l'import réclamerait la variable au moment du build,
        // là où aucune requête n'est faite — et faisait échouer le build en intégration.
        delete process.env["DATABASE_URL"];

        await expect(import("./client.js")).resolves.toBeDefined();
    });

    it("échoue à la première utilisation quand DATABASE_URL manque", async () => {
        // Le report ne doit pas devenir un silence : la variable absente reste une
        // erreur, elle arrive simplement au moment où on s'en sert.
        delete process.env["DATABASE_URL"];
        const { prisma } = await import("./client.js");

        expect(() => prisma.user).toThrow(/DATABASE_URL est absente/);
    });

    it("ne construit qu'une seule instance", async () => {
        // Chaque instance ouvre son pool de connexions. En développement, le
        // rechargement à chaud réévalue les modules, et PostgreSQL finit par refuser
        // les nouvelles connexions.
        process.env["DATABASE_URL"] = "postgresql://essai:essai@localhost:5432/essai";
        const { prisma } = await import("./client.js");

        expect(prisma.user).toBe(prisma.user);
        expect((globalThis as { prisma?: unknown }).prisma).toBeDefined();
    });

    it("lie les méthodes au client réel", async () => {
        // Le proxy renvoie les fonctions liées. Sans cela, `prisma.$transaction()`
        // s'exécuterait avec le proxy pour `this` — et Prisma, qui lit ses champs
        // internes, ne les trouverait pas.
        process.env["DATABASE_URL"] = "postgresql://essai:essai@localhost:5432/essai";
        const { prisma } = await import("./client.js");

        expect(prisma.$disconnect.name).toBe("bound $disconnect");
    });
});
