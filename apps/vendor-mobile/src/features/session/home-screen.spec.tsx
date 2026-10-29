import { ApolloClient } from "@apollo/client";
import { MockedProvider } from "@apollo/client/testing/react";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { HomeScreen } from "./home-screen";
import { ME_QUERY } from "./me.query";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "fr" }] }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

type TShop = { name: string; suspended: boolean } | null;

const data = (shop: TShop) => ({
    me: {
        __typename: "Me",
        user: { __typename: "Account", email: "awa@atelier.test" },
        shop: shop === null ? null : { __typename: "Shop", ...shop },
    },
});

const answers = (shop: TShop) => ({ request: { query: ME_QUERY }, result: { data: data(shop) } });

async function renderHome(mocks: object[], signOut = jest.fn(async () => undefined)) {
    await render(
        <MockedProvider mocks={mocks as never}>
            <HomeScreen signOut={signOut} />
        </MockedProvider>,
    );
    return { signOut };
}

beforeEach(() => mockReplace.mockReset());

describe("HomeScreen", () => {
    it("affiche le nom de la boutique", async () => {
        await renderHome([answers({ name: "Atelier Awa", suspended: false })]);

        expect(await screen.findByText("Atelier Awa")).toBeTruthy();
        expect(screen.getByText("Connecté en tant que awa@atelier.test")).toBeTruthy();
        expect(screen.queryByText("Votre boutique n'apparaît pas au catalogue, et ses articles ne sont pas achetables. Vos commandes en cours restent à traiter normalement.")).toBeNull();
    });

    // La phrase même de l'espace vendeur web (`ShopOffline`) : sur le téléphone, fait pour
    // suivre les commandes, savoir qu'elles restent à traiter compte plus encore.
    it("signale une boutique suspendue, comme le web", async () => {
        await renderHome([answers({ name: "Atelier Awa", suspended: true })]);

        expect(
            await screen.findByText("Votre boutique n'apparaît pas au catalogue, et ses articles ne sont pas achetables. Vos commandes en cours restent à traiter normalement."),
        ).toBeTruthy();
    });

    it("renvoie au web un compte sans boutique", async () => {
        await renderHome([answers(null)]);

        expect(await screen.findByText("Aucune boutique")).toBeTruthy();
        expect(
            screen.getByText("Ce compte n'est membre d'aucune boutique. Ouvrez la vôtre depuis le site ClemPerl."),
        ).toBeTruthy();
    });

    // Le téléphone hors du réseau, ou l'API arrêtée : un écran le dit, et « Réessayer »
    // relance la requête au lieu d'une attente sans fin.
    it("dit l'API injoignable, et réessaie", async () => {
        const user = userEvent.setup();
        await renderHome([
            { request: { query: ME_QUERY }, error: new TypeError("Network request failed") },
            answers({ name: "Atelier Awa", suspended: false }),
        ]);

        expect(await screen.findByText("ClemPerl est injoignable")).toBeTruthy();
        await user.press(screen.getByRole("button", { name: "Réessayer" }));

        expect(await screen.findByText("Atelier Awa")).toBeTruthy();
    });

    it("renvoie à la connexion une session que le serveur refuse", async () => {
        await renderHome([
            {
                request: { query: ME_QUERY },
                result: { data: null, errors: [{ message: "refus", extensions: { code: "UNAUTHENTICATED" } }] },
            },
        ]);

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
    });

    // Une erreur durable autre qu'un refus de session laisserait sinon le vendeur devant
    // « Réessayer », sans pouvoir changer de compte.
    it("propose de se déconnecter depuis l'écran injoignable", async () => {
        const user = userEvent.setup();
        const { signOut } = await renderHome([
            { request: { query: ME_QUERY }, error: new TypeError("Network request failed") },
        ]);

        await user.press(await screen.findByRole("button", { name: "Se déconnecter" }));

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
        expect(signOut).toHaveBeenCalledTimes(1);
    });

    // La boutique, qui monte Better Auth, peut être injoignable quand l'API répond : le client
    // a déjà oublié le cookie, et l'écran ne doit pas rester sur une boutique dont le téléphone
    // n'a plus la session.
    it("se déconnecte même quand la boutique est injoignable", async () => {
        const user = userEvent.setup();
        const clearStore = jest.spyOn(ApolloClient.prototype, "clearStore");
        const signOut = jest.fn(async () => {
            throw new TypeError("Network request failed");
        });
        await renderHome([answers({ name: "Atelier Awa", suspended: false })], signOut);

        await user.press(await screen.findByRole("button", { name: "Se déconnecter" }));

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
        expect(clearStore).toHaveBeenCalledTimes(1);
        clearStore.mockRestore();
    });

    it("se déconnecte, vide le cache, puis revient à la connexion", async () => {
        const user = userEvent.setup();
        const clearStore = jest.spyOn(ApolloClient.prototype, "clearStore");
        const { signOut } = await renderHome([answers({ name: "Atelier Awa", suspended: false })]);

        await user.press(await screen.findByRole("button", { name: "Se déconnecter" }));

        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
        expect(signOut).toHaveBeenCalledTimes(1);
        // Sans cela, le compte suivant verrait un instant la boutique du précédent.
        expect(clearStore).toHaveBeenCalledTimes(1);
        clearStore.mockRestore();
    });
});
