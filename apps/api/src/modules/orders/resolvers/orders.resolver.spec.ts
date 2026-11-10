import { listOrdersForVendor, readOrderForVendor } from "@clemperl/db";
import { allowedOrderActions, formatPrice } from "@clemperl/domain";
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from "@nestjs/graphql";
import { Test } from "@nestjs/testing";
import { OrdersResolver } from "./orders.resolver";

jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    listOrdersForVendor: jest.fn(),
    readOrderForVendor: jest.fn(),
}));

const list = jest.mocked(listOrdersForVendor);
const read = jest.mocked(readOrderForVendor);

// La requête telle que `ShopGuard` la laisse.
const request = {
    session: { user: { id: "u1", email: "a@b.test", name: "Awa" } },
    shop: { id: "v1" },
};

const CREATED_AT = new Date("2026-11-01T10:00:00Z");

// `paymentMethod` est en trop exprès : le dépôt le rend, le contrat ne le porte pas.
const row = (override: Record<string, unknown> = {}) =>
    ({
        id: "o1",
        reference: "CP-0001",
        status: "PLACED",
        currency: "EUR",
        totalAmount: 5000,
        paymentMethod: "OFF_PLATFORM",
        paymentStatus: "PENDING",
        createdAt: CREATED_AT,
        shipToName: "Awa Traoré",
        dispute: null,
        ...override,
    }) as never;

// La commande telle que `readOrderForVendor` la rend : les tentatives de paiement sont là
// exprès, le contrat ne les porte pas.
const detail = (override: Record<string, unknown> = {}) =>
    ({
        id: "o1",
        reference: "CP-0001",
        status: "PLACED",
        currency: "EUR",
        totalAmount: 7500,
        paymentMethod: "OFF_PLATFORM",
        paymentStatus: "PENDING",
        createdAt: CREATED_AT,
        shipToName: "Awa Traoré",
        shipToLine: "12 rue des Tanneurs",
        shipToCity: "Bruxelles",
        shipToCountry: "BE",
        shipToPhone: "+32470000000",
        note: null,
        items: [
            {
                id: "i1",
                productTitle: "Sac cabas",
                variantLabel: "Noir",
                imagePath: "x.jpg",
                unitAmount: 2500,
                quantity: 3,
            },
        ],
        payments: [{ id: "p1" }],
        dispute: null,
        ...override,
    }) as never;

describe("OrdersResolver", () => {
    beforeEach(() => {
        list.mockReset();
        read.mockReset();
    });

    it("rend les commandes de la boutique, champ par champ", async () => {
        list.mockResolvedValue([row()]);

        const orders = await new OrdersResolver().orders(request);

        expect(orders).toStrictEqual([
            {
                id: "o1",
                reference: "CP-0001",
                customerName: "Awa Traoré",
                status: "PLACED",
                paymentStatus: "PENDING",
                total: formatPrice(5000, "EUR"),
                placedAt: CREATED_AT,
                dispute: null,
            },
        ]);
        expect(list).toHaveBeenCalledWith({ marker: "prisma" }, "v1");
    });

    it("formate le total dans la devise de la commande", async () => {
        list.mockResolvedValue([row({ currency: "XOF" })]);

        const [order] = await new OrdersResolver().orders(request);

        expect(order?.total).toBe(formatPrice(5000, "XOF"));
    });

    it("signale un litige à servir", async () => {
        list.mockResolvedValue([row({ dispute: { status: "DECIDED_FOR_BUYER" } })]);

        const [order] = await new OrdersResolver().orders(request);

        expect(order?.dispute).toBe("TO_SERVE");
    });

    it("rend null pour une commande introuvable ou d'une autre boutique", async () => {
        read.mockResolvedValue(null);

        const order = await new OrdersResolver().order(request, "o9");

        expect(order).toBeNull();
        expect(read).toHaveBeenCalledWith({ marker: "prisma" }, { vendorId: "v1", orderId: "o9" });
    });

    it("rend le détail champ par champ", async () => {
        read.mockResolvedValue(detail());

        const order = await new OrdersResolver().order(request, "o1");

        expect(order).toStrictEqual({
            id: "o1",
            reference: "CP-0001",
            status: "PLACED",
            placedAt: CREATED_AT,
            lines: [
                {
                    id: "i1",
                    title: "Sac cabas",
                    variantLabel: "Noir",
                    quantity: 3,
                    total: formatPrice(7500, "EUR"),
                },
            ],
            total: formatPrice(7500, "EUR"),
            paymentMethod: "OFF_PLATFORM",
            paymentStatus: "PENDING",
            shipTo: {
                name: "Awa Traoré",
                line: "12 rue des Tanneurs",
                city: "Bruxelles",
                country: "BE",
                phone: "+32470000000",
            },
            note: null,
            dispute: null,
            actions: allowedOrderActions("PLACED"),
        });
    });

    it("garde la note et signale un litige à servir", async () => {
        read.mockResolvedValue(
            detail({
                note: "Emballage cadeau",
                dispute: { id: "d1", status: "DECIDED_FOR_BUYER" },
            }),
        );

        const order = await new OrdersResolver().order(request, "o1");

        expect(order?.note).toBe("Emballage cadeau");
        expect(order?.dispute).toBe("TO_SERVE");
    });

    it("rend les actions que l'état permet", async () => {
        read.mockResolvedValue(detail({ status: "SHIPPED" }));
        const shipped = await new OrdersResolver().order(request, "o1");
        read.mockResolvedValue(detail());
        const placed = await new OrdersResolver().order(request, "o1");

        expect(placed?.actions).toEqual(allowedOrderActions("PLACED"));
        expect(shipped?.actions).toEqual([]);
    });

    // Les fonctions de type des décorateurs ne s'exécutent qu'à la construction du schéma.
    it("se publie dans le schéma sous les noms du contrat", async () => {
        const module = await Test.createTestingModule({
            imports: [GraphQLSchemaBuilderModule],
        }).compile();
        const schema = await module.get(GraphQLSchemaFactory).create([OrdersResolver]);

        expect(String(schema.getQueryType()?.getFields()["orders"]?.type)).toBe("[OrderSummary!]!");
        const fields = schema.getType("OrderSummary")?.toConfig() as {
            fields: Record<string, { type: unknown }>;
        };
        expect(String(fields.fields["status"]?.type)).toBe("OrderStatus!");
        expect(String(fields.fields["paymentStatus"]?.type)).toBe("PaymentStatus!");
        expect(String(fields.fields["dispute"]?.type)).toBe("DisputeNotice");

        const orderQuery = schema.getQueryType()?.getFields()["order"];
        expect(String(orderQuery?.type)).toBe("Order");
        expect(String(orderQuery?.args[0]?.type)).toBe("ID!");
        const detailFields = schema.getType("Order")?.toConfig() as {
            fields: Record<string, { type: unknown }>;
        };
        expect(String(detailFields.fields["lines"]?.type)).toBe("[OrderLine!]!");
        expect(String(detailFields.fields["shipTo"]?.type)).toBe("ShippingAddress!");
        expect(String(detailFields.fields["paymentMethod"]?.type)).toBe("PaymentMethod!");
        expect(String(detailFields.fields["note"]?.type)).toBe("String");
        expect(String(detailFields.fields["actions"]?.type)).toBe("[OrderAction!]!");
    });
});
