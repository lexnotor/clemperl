import { readVendorForMember } from "@clemperl/db";
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from "@nestjs/graphql";
import { Test } from "@nestjs/testing";
import { MeResolver } from "./me.resolver";

jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    readVendorForMember: jest.fn(),
}));

const readVendor = jest.mocked(readVendorForMember);

// La requête telle que `SessionGuard` la laisse. `emailVerified` est là pour prouver qu'un
// champ de la session qui n'est pas au contrat ne fuit pas dans la réponse.
const request = {
    session: { user: { id: "u1", email: "a@b.test", name: "Awa", emailVerified: true } },
};

const vendor = (suspendedAt: Date | null) =>
    ({
        id: "v1",
        shopName: "Atelier",
        slug: "atelier",
        suspendedAt,
        contactEmail: "contact@atelier.test",
        members: [],
    }) as never;

describe("MeResolver", () => {
    beforeEach(() => readVendor.mockReset());

    it("rend le compte, et aucune boutique quand il n'en a pas", async () => {
        readVendor.mockResolvedValue(null);

        const me = await new MeResolver().me(request);

        expect(me).toEqual({ user: { id: "u1", email: "a@b.test", name: "Awa" }, shop: null });
        expect(readVendor).toHaveBeenCalledWith({ marker: "prisma" }, "u1");
    });

    it("rend la boutique du compte", async () => {
        readVendor.mockResolvedValue(vendor(null));

        const me = await new MeResolver().me(request);

        expect(me).toEqual({
            user: { id: "u1", email: "a@b.test", name: "Awa" },
            shop: { id: "v1", name: "Atelier", slug: "atelier", suspended: false },
        });
    });

    it("dit qu'une boutique est suspendue", async () => {
        readVendor.mockResolvedValue(vendor(new Date("2026-10-01T00:00:00Z")));

        const me = await new MeResolver().me(request);

        expect(me.shop?.suspended).toBe(true);
    });

    // Les fonctions de type des décorateurs, `() => MeDto` ou `() => ShopDto`, ne
    // s'exécutent qu'à la construction du schéma. Ce cas prouve le contrat, et sans lui la
    // couverture des fonctions tomberait sous 100 %.
    it("se publie dans le schéma sous les noms du contrat", async () => {
        const module = await Test.createTestingModule({
            imports: [GraphQLSchemaBuilderModule],
        }).compile();
        const schema = await module.get(GraphQLSchemaFactory).create([MeResolver]);

        const me = schema.getQueryType()?.getFields()["me"];
        expect(String(me?.type)).toBe("Me!");
        const fields = schema.getType("Me")?.toConfig() as {
            fields: Record<string, { type: unknown }>;
        };
        expect(String(fields.fields["shop"]?.type)).toBe("Shop");
        expect(String(fields.fields["user"]?.type)).toBe("Account!");
    });
});
