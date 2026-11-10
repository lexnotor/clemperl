import { render, screen } from "@testing-library/react-native";
import { ProductRow } from "./product-row";

const mockLanguage = jest.fn(() => "fr");
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: mockLanguage() }] }));

beforeEach(() => {
    mockLanguage.mockReturnValue("fr");
});

describe("ProductRow", () => {
    it("dit « Publié » pour un produit publié, avec son titre", async () => {
        await render(<ProductRow title="Sac cabas" status="PUBLISHED" />);

        expect(screen.getByText("Sac cabas")).toBeTruthy();
        expect(screen.getByText("Publié")).toBeTruthy();
    });

    it("dit « Brouillon » pour un brouillon, avec son titre", async () => {
        await render(<ProductRow title="Ceinture" status="DRAFT" />);

        expect(screen.getByText("Ceinture")).toBeTruthy();
        expect(screen.getByText("Brouillon")).toBeTruthy();
    });

    it("dit « Published » sur un téléphone en anglais, avec le titre", async () => {
        mockLanguage.mockReturnValue("en");
        await render(<ProductRow title="Sac cabas" status="PUBLISHED" />);

        expect(screen.getByText("Sac cabas")).toBeTruthy();
        expect(screen.getByText("Published")).toBeTruthy();
    });
});
