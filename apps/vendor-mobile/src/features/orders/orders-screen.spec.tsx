import { MockedProvider } from "@apollo/client/testing/react";
import { render, screen, userEvent } from "@testing-library/react-native";
import { OrdersScreen } from "./orders-screen";
import { ORDERS_QUERY } from "./orders.query";

const mockLanguage = jest.fn(() => "fr");
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: mockLanguage() }] }));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    useRouter: () => ({ replace: mockReplace, push: mockPush }),
    Stack: { Screen: () => null },
}));

type TDispute = "OPEN" | "TO_SERVE" | null;

const order = (dispute: TDispute = null) => ({
    __typename: "OrderSummary",
    id: "o1",
    reference: "CP-0001",
    customerName: "Awa Diop",
    status: "PLACED",
    paymentStatus: "PENDING",
    total: "120,00 €",
    placedAt: "2026-11-10T09:00:00.000Z",
    dispute,
});

const answers = (orders: object[]) => [
    { request: { query: ORDERS_QUERY }, result: { data: { orders } } },
];

async function renderOrders(orders: object[]) {
    await render(
        <MockedProvider mocks={answers(orders) as never}>
            <OrdersScreen />
        </MockedProvider>,
    );
}

beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockLanguage.mockReturnValue("fr");
});

describe("OrdersScreen", () => {
    it("affiche les commandes comme la liste web", async () => {
        await renderOrders([order()]);

        expect(await screen.findByText("CP-0001")).toBeTruthy();
        expect(screen.getByText("120,00 €")).toBeTruthy();
        expect(screen.getByText("Reçue · Paiement : En attente")).toBeTruthy();
        expect(screen.getByText("Awa Diop")).toBeTruthy();
        expect(screen.getByText("10 novembre 2026")).toBeTruthy();
    });

    it("signale un litige à servir", async () => {
        await renderOrders([order("TO_SERVE")]);

        expect(await screen.findByText("Litige tranché : client à servir")).toBeTruthy();
    });

    it("dit qu'il n'y a pas encore de commande", async () => {
        await renderOrders([]);

        expect(await screen.findByText("Vous n'avez pas encore de commande.")).toBeTruthy();
    });

    it("ouvre la commande touchée", async () => {
        const user = userEvent.setup();
        await renderOrders([order()]);

        await user.press(await screen.findByText("CP-0001"));

        expect(mockPush).toHaveBeenCalledWith({ pathname: "/orders/[id]", params: { id: "o1" } });
    });

    it("parle anglais sur un téléphone en anglais", async () => {
        mockLanguage.mockReturnValue("en");
        await renderOrders([order()]);

        expect(await screen.findByText("Received · Payment: Pending")).toBeTruthy();
        expect(screen.getByText("November 10, 2026")).toBeTruthy();
    });
});
