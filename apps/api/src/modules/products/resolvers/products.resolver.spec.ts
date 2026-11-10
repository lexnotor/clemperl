import { listProductsForVendor } from "@clemperl/db";
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from "@nestjs/graphql";
import { Test } from "@nestjs/testing";
import { ProductsResolver } from "./products.resolver";

jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    listProductsForVendor: jest.fn(),
}));

const list = jest.mocked(listProductsForVendor);

// La requête telle que `ShopGuard` la laisse.
const request = {
    session: { user: { id: "u1", email: "a@b.test", name: "Awa" } },
    shop: { id: "v1" },
};

// La description, le slug et les variantes sont là exprès : le dépôt les rend, le contrat
// ne les porte pas.
const row = (override: Record<string, unknown> = {}) =>
    ({
        id: "p1",
        title: "Sac cabas",
        slug: "sac-cabas",
        description: "Cuir pleine fleur, coutures à la main.",
        status: "PUBLISHED",
        variants: [{ id: "v1", priceAmount: 5000 }],
        ...override,
    }) as never;

describe("ProductsResolver", () => {
    beforeEach(() => {
        list.mockReset();
    });

    it("rend les produits de la boutique, champ par champ", async () => {
        list.mockResolvedValue([row()]);

        const products = await new ProductsResolver().products(request);

        expect(products).toStrictEqual([{ id: "p1", title: "Sac cabas", status: "PUBLISHED" }]);
        expect(list).toHaveBeenCalledWith({ marker: "prisma" }, "v1");
    });

    // Les fonctions de type des décorateurs ne s'exécutent qu'à la construction du schéma.
    it("se publie dans le schéma sous les noms du contrat", async () => {
        const module = await Test.createTestingModule({
            imports: [GraphQLSchemaBuilderModule],
        }).compile();
        const schema = await module.get(GraphQLSchemaFactory).create([ProductsResolver]);

        expect(String(schema.getQueryType()?.getFields()["products"]?.type)).toBe(
            "[ProductSummary!]!",
        );
        const fields = schema.getType("ProductSummary")?.toConfig() as {
            fields: Record<string, { type: unknown }>;
        };
        expect(String(fields.fields["id"]?.type)).toBe("ID!");
        expect(String(fields.fields["title"]?.type)).toBe("String!");
        expect(String(fields.fields["status"]?.type)).toBe("ProductStatus!");
    });
});
