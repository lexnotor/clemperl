import { MockedProvider } from "@apollo/client/testing/react";
import { render, screen } from "@testing-library/react-native";
import { OrderScreen } from "./order-screen";
import { ORDER_QUERY } from "./order.query";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "fr" }] }));

jest.mock("expo-router", () => ({
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
    Stack: { Screen: () => null },
}));

type TDispute = "OPEN" | "TO_SERVE" | null;

const order = (note: string | null = null, dispute: TDispute = null) => ({
    __typename: "Order",
    id: "o1",
    reference: "CP-0001",
    status: "PLACED",
    placedAt: "2026-11-10T09:00:00.000Z",
    lines: [
        {
            __typename: "OrderLine",
            id: "l1",
            title: "Sac cabas",
            variantLabel: "Noir",
            quantity: 2,
            total: "60,00 €",
        },
        {
            __typename: "OrderLine",
            id: "l2",
            title: "Porte-clés",
            variantLabel: "",
            quantity: 1,
            total: "60,00 €",
        },
    ],
    total: "120,00 €",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "PENDING",
    shipTo: {
        __typename: "ShippingAddress",
        name: "Awa Diop",
        line: "12 rue des Lilas",
        city: "Dakar",
        country: "Sénégal",
        phone: "+221 77 000 00 00",
    },
    note,
    dispute,
});

async function renderOrder(found: object | null) {
    const mocks = [
        {
            request: { query: ORDER_QUERY, variables: { id: "o1" } },
            result: { data: { order: found } },
        },
    ];
    await render(
        <MockedProvider mocks={mocks as never}>
            <OrderScreen id="o1" />
        </MockedProvider>,
    );
}

describe("OrderScreen", () => {
    it("affiche la commande comme la page web", async () => {
        await renderOrder(order());

        expect(await screen.findByText("CP-0001")).toBeTruthy();
        expect(screen.getByText("Reçue")).toBeTruthy();
        expect(screen.getByText("Passée le 10 novembre 2026")).toBeTruthy();
        expect(screen.getByText("Sac cabas (Noir) x2")).toBeTruthy();
        expect(screen.getByText("Porte-clés x1")).toBeTruthy();
        expect(screen.getAllByText("60,00 €")).toHaveLength(2);
        expect(screen.getByText("Total : 120,00 €")).toBeTruthy();
        expect(screen.getByText("Paiement à la livraison")).toBeTruthy();
        expect(screen.getByText("En attente")).toBeTruthy();
        expect(screen.getByText("Awa Diop")).toBeTruthy();
        expect(screen.getByText("12 rue des Lilas")).toBeTruthy();
        expect(screen.getByText("Dakar, Sénégal")).toBeTruthy();
        expect(screen.getByText("+221 77 000 00 00")).toBeTruthy();
    });

    it("montre le mot de l'acheteur s'il y en a un", async () => {
        await renderOrder(order("Sonnez deux fois"));

        expect(await screen.findByText("Sonnez deux fois")).toBeTruthy();
        expect(screen.getByText("Mot de l'acheteur")).toBeTruthy();
    });

    it("n'affiche pas le mot de l'acheteur quand il n'y en a pas", async () => {
        await renderOrder(order(null));

        await screen.findByText("CP-0001");
        expect(screen.queryByText("Mot de l'acheteur")).toBeNull();
    });

    it("signale un litige ouvert, à traiter sur le site", async () => {
        await renderOrder(order(null, "OPEN"));

        expect(await screen.findByText("Litige ouvert, à traiter sur le site")).toBeTruthy();
    });

    it("dit qu'une commande est introuvable", async () => {
        await renderOrder(null);

        expect(await screen.findByText("Cette commande est introuvable.")).toBeTruthy();
    });
});
