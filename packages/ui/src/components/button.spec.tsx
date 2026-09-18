import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
    it("affiche son contenu", () => {
        render(<Button>Ajouter au panier</Button>);
        expect(screen.getByRole("button", { name: "Ajouter au panier" })).toBeVisible();
    });

    it("laisse une classe passée en prop surcharger la classe par défaut", () => {
        render(<Button className="rounded-none">Valider</Button>);
        expect(screen.getByRole("button")).toHaveClass("rounded-none");
    });

    it("transmet l'état désactivé au bouton natif", () => {
        render(<Button disabled>Payer</Button>);
        expect(screen.getByRole("button")).toBeDisabled();
    });
});
