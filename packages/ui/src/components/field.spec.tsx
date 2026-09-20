import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, TextAreaField } from "./field";

describe("Field", () => {
    // Le libellé doit être ASSOCIÉ au champ, pas seulement posé au-dessus : c'est ce
    // lien que lisent les lecteurs d'écran, et c'est sur lui que repose `getByLabel`
    // dans toute la suite Playwright.
    it("associe son libellé au champ", () => {
        render(<Field label="Nom de la boutique" name="shopName" />);
        expect(screen.getByLabelText("Nom de la boutique")).toHaveAttribute("name", "shopName");
    });

    it("affiche l'aide quand elle est fournie, et rien sinon", () => {
        const { rerender } = render(<Field label="Mot de passe" hint="Huit caractères." />);
        expect(screen.getByText("Huit caractères.")).toBeVisible();

        rerender(<Field label="Mot de passe" />);
        expect(screen.queryByText("Huit caractères.")).toBeNull();
    });

    it("transmet les attributs natifs du champ", () => {
        render(<Field label="Pays" required maxLength={2} />);
        const control = screen.getByLabelText("Pays");
        expect(control).toBeRequired();
        expect(control).toHaveAttribute("maxLength", "2");
    });

    it("laisse une classe passée en prop compléter la sienne", () => {
        render(<Field label="Ville" className="uppercase" />);
        expect(screen.getByLabelText("Ville")).toHaveClass("uppercase");
    });
});

describe("TextAreaField", () => {
    it("associe son libellé à la zone de texte", () => {
        render(<TextAreaField label="Description" name="shopDescription" rows={4} />);
        const control = screen.getByLabelText("Description");
        expect(control.tagName).toBe("TEXTAREA");
        expect(control).toHaveAttribute("rows", "4");
    });

    it("affiche l'aide quand elle est fournie", () => {
        render(<TextAreaField label="Description" hint="Vingt caractères minimum." />);
        expect(screen.getByText("Vingt caractères minimum.")).toBeVisible();
    });
});
