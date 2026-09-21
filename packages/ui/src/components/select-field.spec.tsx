import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SelectField } from "./select-field";

const CURRENCIES = [
    { value: "EUR", label: "Euro (€)" },
    { value: "XOF", label: "Franc CFA — UEMOA (F CFA)" },
];

describe("SelectField", () => {
    // Le libellé doit être ASSOCIÉ au contrôle : c'est ce lien que lisent les lecteurs
    // d'écran, et c'est sur lui que reposent les sélecteurs de la suite Playwright.
    it("associe son libellé au contrôle", () => {
        render(<SelectField label="Devise des prix" name="currency" options={CURRENCIES} />);
        expect(screen.getByLabelText("Devise des prix")).toHaveAttribute("name", "currency");
    });

    it("rend une option par valeur", () => {
        render(<SelectField label="Devise des prix" options={CURRENCIES} />);
        expect(screen.getAllByRole("option")).toHaveLength(2);
    });

    // L'entrée vide est désactivée : elle dit qu'aucun choix n'est fait, sans devenir
    // elle-même un choix enregistrable.
    it("ajoute une entrée vide désactivée quand on lui donne un texte d'attente", () => {
        render(<SelectField label="Devise des prix" options={CURRENCIES} placeholder="—" />);
        expect(screen.getByRole("option", { name: "—" })).toBeDisabled();
    });

    it("affiche son indication", () => {
        render(
            <SelectField label="Devise des prix" options={CURRENCIES} hint="Elle se fige ensuite." />,
        );
        expect(screen.getByText("Elle se fige ensuite.")).toBeInTheDocument();
    });

    it("se laisse désactiver", () => {
        render(<SelectField label="Devise des prix" options={CURRENCIES} disabled />);
        expect(screen.getByLabelText("Devise des prix")).toBeDisabled();
    });
});

// La raison d'être de la dissociation libellé / contrôle, comme pour `Field`.
describe("le nom accessible du select", () => {
    it("ne contient pas l'indication", () => {
        render(
            <SelectField
                label="Devise des prix"
                hint="Elle se fige dès que votre premier produit existe."
                options={CURRENCIES}
            />,
        );
        expect(screen.getByRole("combobox", { name: "Devise des prix" })).toBeInTheDocument();
    });

    it("lie l'indication au contrôle comme description", () => {
        render(<SelectField label="Devise des prix" hint="Elle se fige." options={CURRENCIES} />);
        expect(
            screen.getByRole("combobox", { name: "Devise des prix" }),
        ).toHaveAccessibleDescription("Elle se fige.");
    });

    // Étalé avant, un `aria-describedby` fourni par l'appelant écraserait l'indication,
    // qui resterait visible sans être annoncée.
    it("conserve l'indication quand l'appelant ajoute sa propre description", () => {
        render(
            <>
                <span id="externe">Ce champ est requis.</span>
                <SelectField
                    label="Devise des prix"
                    hint="Elle se fige."
                    aria-describedby="externe"
                    options={CURRENCIES}
                />
            </>,
        );
        expect(
            screen.getByRole("combobox", { name: "Devise des prix" }),
        ).toHaveAccessibleDescription("Ce champ est requis. Elle se fige.");
    });
});
