import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { QueryGate } from "./query-gate";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "fr" }] }));

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const graphqlError = (code: string) =>
    new CombinedGraphQLErrors({ data: null, errors: [{ message: "refus", extensions: { code } }] });

beforeEach(() => mockReplace.mockReset());

describe("QueryGate", () => {
    it("affiche l'attente tant que la requête court", async () => {
        await render(
            <QueryGate result={{ loading: true, refetch: jest.fn() }}>
                {() => <Text>prêt</Text>}
            </QueryGate>,
        );

        expect(screen.getByText("Chargement…")).toBeTruthy();
        expect(screen.queryByText("prêt")).toBeNull();
    });

    it("renvoie à la connexion sur UNAUTHENTICATED", async () => {
        await render(
            <QueryGate
                result={{
                    loading: false,
                    error: graphqlError("UNAUTHENTICATED"),
                    refetch: jest.fn(),
                }}
            >
                {() => <Text>prêt</Text>}
            </QueryGate>,
        );

        expect(mockReplace).toHaveBeenCalledWith("/sign-in");
    });

    // Le compte a perdu sa boutique pendant que l'application était ouverte : l'accueil dit
    // « Aucune boutique ».
    it("renvoie à l'accueil sur FORBIDDEN", async () => {
        await render(
            <QueryGate
                result={{ loading: false, error: graphqlError("FORBIDDEN"), refetch: jest.fn() }}
            >
                {() => <Text>prêt</Text>}
            </QueryGate>,
        );

        expect(mockReplace).toHaveBeenCalledWith("/");
    });

    it("dit ClemPerl injoignable, et réessaie", async () => {
        const user = userEvent.setup();
        const refetch = jest.fn();
        await render(
            <QueryGate
                result={{ loading: false, error: new TypeError("Network request failed"), refetch }}
            >
                {() => <Text>prêt</Text>}
            </QueryGate>,
        );

        expect(screen.getByText("ClemPerl est injoignable")).toBeTruthy();
        await user.press(screen.getByRole("button", { name: "Réessayer" }));

        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it("rend les enfants avec les données", async () => {
        await render(
            <QueryGate result={{ loading: false, data: { name: "Awa" }, refetch: jest.fn() }}>
                {(data) => <Text>{data.name}</Text>}
            </QueryGate>,
        );

        expect(screen.getByText("Awa")).toBeTruthy();
    });
});
