import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckboxField } from "./checkbox-field";

describe("CheckboxField", () => {
    // Le libellé doit être ASSOCIÉ au contrôle : c'est ce lien que lisent les lecteurs
    // d'écran, et c'est sur lui que repose `getByLabel` dans toute la suite Playwright.
    it("associe son libellé au contrôle", () => {
        render(<CheckboxField label="Joaillerie" name="categories" value="JEWELLERY" />);
        expect(screen.getByLabelText("Joaillerie")).toHaveAttribute("value", "JEWELLERY");
    });

    it("rend bien une case à cocher", () => {
        render(<CheckboxField label="Habillement" />);
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("honore `defaultChecked`", () => {
        render(<CheckboxField label="Maroquinerie" defaultChecked />);
        expect(screen.getByRole("checkbox")).toBeChecked();
    });
});
