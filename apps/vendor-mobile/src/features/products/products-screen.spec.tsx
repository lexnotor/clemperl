import { MockedProvider } from "@apollo/client/testing/react";
import { render, screen } from "@testing-library/react-native";
import { ProductsScreen } from "./products-screen";
import { PRODUCTS_QUERY } from "./products.query";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "fr" }] }));

jest.mock("expo-router", () => ({
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    Stack: { Screen: () => null },
}));

const product = (id: string, title: string, status: "DRAFT" | "PUBLISHED") => ({
    __typename: "ProductSummary",
    id,
    title,
    status,
});

async function renderProducts(products: object[]) {
    await render(
        <MockedProvider
            mocks={
                [{ request: { query: PRODUCTS_QUERY }, result: { data: { products } } }] as never
            }
        >
            <ProductsScreen />
        </MockedProvider>,
    );
}

describe("ProductsScreen", () => {
    it("affiche une ligne par produit", async () => {
        await renderProducts([
            product("p1", "Sac cabas", "PUBLISHED"),
            product("p2", "Ceinture", "DRAFT"),
        ]);

        expect(await screen.findByText("Sac cabas")).toBeTruthy();
        expect(screen.getByText("Publié")).toBeTruthy();
        expect(screen.getByText("Ceinture")).toBeTruthy();
        expect(screen.getByText("Brouillon")).toBeTruthy();
    });

    it("dit qu'il n'y a pas encore de produit", async () => {
        await renderProducts([]);

        expect(
            await screen.findByText(
                "Vous n'avez pas encore de produit. Créez-les depuis le site ClemPerl.",
            ),
        ).toBeTruthy();
    });
});
